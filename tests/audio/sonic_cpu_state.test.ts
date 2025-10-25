import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic CPU state diagnostic', () => {
  it('checks CPU state after 100k cycles', async () => {
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

    // Run 100k cycles (about 1.7 frames)
    for (let i = 0; i < 1000; i++) {
      let cyclesToRun = 100;
      while (cyclesToRun > 0) {
        const { cycles } = cpu.stepOne();
        cyclesToRun -= cycles;
      }
    }

    const state = cpu.getState();
    console.log(`[cpu_state] PC: 0x${state.pc.toString(16).padStart(4,'0')}`);
    console.log(`[cpu_state] SP: 0x${state.sp.toString(16).padStart(4,'0')}`);
    console.log(`[cpu_state] Halted: ${state.halted}`);
    console.log(`[cpu_state] IFF1: ${state.iff1}, IFF2: ${state.iff2}`);
    console.log(`[cpu_state] IM: ${state.im}`);
    console.log(`[cpu_state] A: 0x${state.a.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] F: 0x${state.f.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] B: 0x${state.b.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] C: 0x${state.c.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] D: 0x${state.d.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] E: 0x${state.e.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] H: 0x${state.h.toString(16).padStart(2,'0')}`);
    console.log(`[cpu_state] L: 0x${state.l.toString(16).padStart(2,'0')}`);

    // Read memory at PC to see what instruction is there
    const bus = m.getBus();
    const instr = bus.read8(state.pc) & 0xff;
    console.log(`[cpu_state] Instruction at PC: 0x${instr.toString(16).padStart(2,'0')}`);

    // Check if CPU is halted
    if (state.halted) {
      console.log(`[cpu_state] ⚠️ CPU is HALTED`);
    }
    
    // Check if in a tight loop (PC not advancing much)
    if (state.pc < 0x1000) {
      console.log(`[cpu_state] ⚠️ CPU stuck in early ROM (PC=0x${state.pc.toString(16).padStart(4,'0')})`);
    }

    expect(state.pc).toBeGreaterThan(0);
  }, 120000);
});
