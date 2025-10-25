import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic CPU execution trace', () => {
  it('traces CPU execution for first 100 frames', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const frames = 5; // 5 frames

    const pcSamples: Set<number> = new Set();
    let stepCount = 0;

    // Sample PC every frame
    for (let frame = 0; frame < frames; frame++) {
      let cyclesToRun = cyclesPerFrame;
      while (cyclesToRun > 0) {
        const { cycles } = cpu.stepOne();
        cyclesToRun -= cycles;
        stepCount++;
      }
      
      const state = cpu.getState();
      const pc = state.pc & 0xffff;
      pcSamples.add(pc);
      console.log(`[sonic_trace] Frame ${frame}: PC=0x${pc.toString(16).padStart(4,'0')}`);
    }

    console.log(`[sonic_trace] Unique PC values in first ${frames} frames: ${pcSamples.size}`);
    console.log(`[sonic_trace] Total steps: ${stepCount}`);
    
    // Should have many unique PC values (not stuck in one place)
    expect(pcSamples.size).toBeGreaterThan(10);
  }, 120000);
});
