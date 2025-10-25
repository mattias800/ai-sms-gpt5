import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic instruction trace', () => {
  it('traces instructions executed', async () => {
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
    const bus = m.getBus();

    const instructionMap: Record<number, number> = {}; // PC -> count
    let stepCount = 0;
    const MAX_STEPS = 10000; // Sample first 10k instructions

    while (stepCount < MAX_STEPS) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;
      
      // Track unique PCs
      instructionMap[pc] = (instructionMap[pc] ?? 0) + 1;

      const { cycles } = cpu.stepOne();
      stepCount++;
    }

    // Sort by frequency
    const sorted = Object.entries(instructionMap)
      .map(([pc, count]) => ({ pc: parseInt(pc, 10), count }))
      .sort((a, b) => b.count - a.count);

    console.log(`[trace] Total instructions executed: ${stepCount}`);
    console.log(`[trace] Unique PCs: ${sorted.length}`);
    console.log(`[trace] Top 10 most executed PCs:`);
    
    for (let i = 0; i < Math.min(10, sorted.length); i++) {
      const { pc, count } = sorted[i];
      const instr = bus.read8(pc) & 0xff;
      console.log(`  [${i}] PC=0x${pc.toString(16).padStart(4,'0')} (0x${instr.toString(16).padStart(2,'0')}): ${count} times (${((count / stepCount) * 100).toFixed(1)}%)`);
    }

    // Check execution pattern
    if (sorted[0].count > stepCount * 0.5) {
      console.log(`[trace] ⚠️ TIGHT LOOP DETECTED: Top PC executed ${((sorted[0].count / stepCount) * 100).toFixed(1)}% of time`);
    }
  }, 120000);
});
