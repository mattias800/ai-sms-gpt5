import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic title screen audio', () => {
  it('produces non-zero audio within 3 seconds on title screen', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      console.log('[sonic_audio] Skipping: sonic.sms not found');
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();
    const psg = m.getPSG();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const frames = 180; // 3 seconds at 60 FPS

    const sampleRate = 44100;
    const samplesPerFrame = Math.floor(sampleRate / 60);
    const samples = new Int16Array(samplesPerFrame * frames);
    let sampleIdx = 0;

    // Run emulator and collect audio
    for (let frame = 0; frame < frames; frame++) {
      let cyclesToRun = cyclesPerFrame;
      while (cyclesToRun > 0) {
        const { cycles } = cpu.stepOne();
        cyclesToRun -= cycles;
      }

      // Collect PSG samples for this frame
      for (let i = 0; i < samplesPerFrame; i++) {
        const s = psg.getSample();
        samples[sampleIdx++] = s;
      }
    }

    // Analyze audio
    let nonZeroCount = 0;
    let maxAbs = 0;
    let sum2 = 0;

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s !== 0) nonZeroCount++;
      const abs = Math.abs(s);
      if (abs > maxAbs) maxAbs = abs;
      sum2 += s * s;
    }

    const rms = Math.sqrt(sum2 / samples.length);

    console.log(`[sonic_audio] Analysis over 3 seconds:`);
    console.log(`[sonic_audio] Non-zero samples: ${nonZeroCount}/${samples.length} (${(nonZeroCount / samples.length * 100).toFixed(1)}%)`);
    console.log(`[sonic_audio] Max amplitude: ${maxAbs}`);
    console.log(`[sonic_audio] RMS: ${rms.toFixed(2)}`);

    // Sonic title screen should have audible music
    // Expect at least 50% non-zero samples and reasonable RMS power
    expect(nonZeroCount).toBeGreaterThan(samples.length * 0.5);
    expect(rms).toBeGreaterThan(100);
    console.log(`[sonic_audio] ✓ Sonic title screen produces audio`);
  }, 120000);
});
