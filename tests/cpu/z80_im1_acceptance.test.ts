import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IM1 acceptance timing', () => {
  it('accepts IM1 exactly after the next instruction following EI', () => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; NOP; NOP; HALT
    mem.set([0xFB, 0x00, 0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Step EI
    expect(step(cpu)).toBeGreaterThan(0);
    // Even if IRQ is requested now, it must not be accepted for exactly one instruction
    cpu.requestIRQ();
    const c1 = step(cpu); // Execute NOP (masked)
    expect(c1).toBeGreaterThan(0);

    // Next instruction, IRQ should be accepted (IM1 -> PC=0x0038)
    const c2 = step(cpu);
    expect(c2).toBe(13);
    const s = cpu.getState();
    expect(s.pc & 0xffff).toBe(0x0038);
  });

  it('accepts IM1 while halted on next step boundary', () => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; HALT
    mem.set([0xFB, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // EI
    step(cpu);
    // HALT (no IRQ accepted yet)
    step(cpu);
    // Request IRQ while halted; next step must accept IM1
    cpu.requestIRQ();
    const c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().pc & 0xffff).toBe(0x0038);
  });
});
