import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

// Simple audio smoke test: run Sonic with BIOS for ~1.5s at 8kHz sampling,
// compute RMS energy and ensure PSG ever unmutes (any volume < 0xF) and RMS > threshold.
// This guards against regressions where EI/interrupts fail and PSG stays muted.

describe('Sonic audio smoke (PSG unmute + RMS energy)', (): void => {
  it('produces non-zero audio and unmutes PSG within a short window', async (): Promise<void> => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, 'sonic.sms');
    const biosPath = path.join(ROOT, 'bios13fx.sms');

    // Ensure files exist (skip gracefully if absent)
    await expect(fs.access(romPath)).resolves.not.toThrow();
    await expect(fs.access(biosPath)).resolves.not.toThrow();

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

    const m = createMachine({ cart: { rom }, bus: { allowCartRam: true, bios },  });
    const cpu = m.getCPU();
    const vdp = m.getVDP();
    const psg = m.getPSG();

    // Audio sampling params kept light for CI speed
    const CPU_CLOCK_HZ = 3579545;
    const sampleRate = 8000; // Hz
    const seconds = 2.0; // render duration
    const totalSamples = Math.floor(sampleRate * seconds);
    const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;

    let cyclesCarry = 0;
    let sumSquares = 0;
    let maxAbs = 0;
    let sawUnmute = false;

    for (let i = 0; i < totalSamples; i++) {
      cyclesCarry += cyclesPerSample;
      let toRun = Math.floor(cyclesCarry);
      cyclesCarry -= toRun;

      // Run CPU/VDP/PSG for the cycles corresponding to one audio sample
      while (toRun > 0) {
        const { cycles } = cpu.stepOne();
        toRun -= cycles;
        vdp.tickCycles(cycles);
        psg.tickCycles(cycles);
        if (vdp.hasIRQ()) cpu.requestIRQ();
      }

      const s = psg.getSample() | 0;
      if (!sawUnmute) {
        const vols = psg.getState().vols;
        if (vols.some((v) => (v & 0x0f) < 0x0f)) sawUnmute = true;
      }
      const a = Math.abs(s);
      if (a > maxAbs) maxAbs = a;
      sumSquares += s * s;
    }

    const rms = Math.sqrt(sumSquares / totalSamples) / 32768; // 0..1 normalized

    // Assertions: PSG unmuted and energy is above a minimal threshold
    expect(sawUnmute).toBe(true);
    expect(rms).toBeGreaterThan(0.003); // conservative threshold at 8kHz/1.5s
    expect(maxAbs).toBeGreaterThan(0);  // some non-zero peak
  }, 30000); // allow up to 30s just in case; typically completes fast
});

