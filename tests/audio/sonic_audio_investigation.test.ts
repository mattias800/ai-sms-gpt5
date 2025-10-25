import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic audio investigation', () => {
  it('captures CPU context during PSG writes to identify audio driver code', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      console.log('[sonic_investigation] Skipping: sonic.sms not found');
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();
    const bus = m.getBus();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const frames = 180;

    const originalWriteIO8 = bus.writeIO8.bind(bus);
    const psgWrites: Array<{ port: number; val: number; pc: number; frameNum: number }> = [];
    let frameNum = 0;

    bus.writeIO8 = (port: number, val: number): void => {
      if ((port & 0xff) === 0x7e || (port & 0xff) === 0x7f) {
        const cpuState = cpu.getState();
        psgWrites.push({ port, val, pc: cpuState.pc & 0xffff, frameNum });
      }
      return originalWriteIO8(port, val);
    };

    // Run emulator
    for (let frame = 0; frame < frames; frame++) {
      frameNum = frame;
      let cyclesToRun = cyclesPerFrame;
      while (cyclesToRun > 0) {
        const { cycles } = cpu.stepOne();
        cyclesToRun -= cycles;
      }
    }

    // Analyze PCs that write PSG
    const pcSet = new Set<number>();
    for (const w of psgWrites) {
      pcSet.add(w.pc);
    }

    console.log(`[sonic_investigation] PSG writes from ${pcSet.size} unique PCs:`);
    const pcsByFrequency = Array.from(pcSet)
      .map(pc => ({ pc, count: psgWrites.filter(w => w.pc === pc).length }))
      .sort((a, b) => b.count - a.count);

    for (const { pc, count } of pcsByFrequency.slice(0, 10)) {
      console.log(`[sonic_investigation]   PC=0x${pc.toString(16).padStart(4, '0')}: ${count} writes`);
    }

    // Check interrupt acceptance count
    const debugStats = m.getDebugStats?.();
    if (debugStats) {
      console.log(`[sonic_investigation] CPU stats over 3 seconds:`);
      console.log(`[sonic_investigation]   IRQs accepted: ${debugStats.irqAccepted}`);
      console.log(`[sonic_investigation]   EI instructions: ${debugStats.eiCount}`);
      console.log(`[sonic_investigation]   DI instructions: ${debugStats.diCount}`);
    }

    // Find first volume write that's NOT 0xF
    const firstUnmute = psgWrites.find(w => (w.val & 0x80) && (w.val & 0x10) && (w.val & 0x0f) < 0xf);
    if (firstUnmute) {
      console.log(`[sonic_investigation] First unmute at frame ${firstUnmute.frameNum}, PC=0x${firstUnmute.pc.toString(16).padStart(4, '0')}`);
    } else {
      console.log(`[sonic_investigation] ❌ No unmute found in 3 seconds`);
      console.log(`[sonic_investigation] This suggests audio driver is stuck or not reaching unmute code`);
    }

    // Show volume write pattern from first PC that writes to PSG
    const topPC = pcsByFrequency[0]?.pc;
    if (topPC !== undefined) {
      const writesFromTopPC = psgWrites.filter(w => w.pc === topPC).slice(0, 10);
      console.log(`[sonic_investigation] First 10 writes from top PC (0x${topPC.toString(16).padStart(4, '0')}):`);
      for (const w of writesFromTopPC) {
        const isBitSet = (val: number, bit: number) => (val & (1 << bit)) !== 0;
        const val = w.val;
        if (isBitSet(val, 7)) {
          const ch = (val >> 5) & 0x03;
          const isVol = isBitSet(val, 4);
          const data = val & 0x0f;
          const type = isVol ? 'VOL' : 'TONE';
          console.log(`[sonic_investigation]   Frame ${w.frameNum}: ch${ch} ${type} data=0x${data.toString(16)}`);
        }
      }
    }

    expect(psgWrites.length).toBeGreaterThan(0);
  }, 120000);
});
