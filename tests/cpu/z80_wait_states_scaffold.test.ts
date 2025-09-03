import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type WaitStateHooks } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 wait-state scaffolding (disabled by default)', (): void => {
  it('Default (disabled) does not affect cycles; hooks can report last wait cycles of previous step', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // NOP; NOP; HALT
    mem.set([0x00, 0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Step 1: NOP (no wait configured). Previous step wait cycles reported now (initially 0)
    step(cpu);
    expect(cpu.getLastWaitCycles()).toBe(0);

    // Step 2: NOP; still no wait configured, so last is 0
    step(cpu);
    expect(cpu.getLastWaitCycles()).toBe(0);
  });

  it('When enabled, memPenalty accumulates during a step and is exposed on the next step', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; NOP; HALT
    mem.set([0x00, 0x00, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1, // +1 per memory access
    };
    const cpu = createZ80({ bus, waitStates: ws });

    // Step 1 executes first NOP: accesses: opcode fetch => +1 wait
    step(cpu);
    // At start of step 2, getLastWaitCycles() shows the previous step's total (peek + fetch = 2)
    step(cpu); // execute second NOP
    expect(cpu.getLastWaitCycles()).toBe(2);

    // After step 3 (HALT), last wait cycles should reflect the second NOP (also 2)
    step(cpu);
    expect(cpu.getLastWaitCycles()).toBe(2);
  });

  it('LD (HL),n triggers penalties for opcode fetch + immediate read + memory write', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD (HL),0x12 ; HALT
    mem.set([0x36, 0x12, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
    };
    const cpu = createZ80({ bus, waitStates: ws });
    // Set HL to 0x4000
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00 });

    // Step 1: LD (HL),n => expected penalties: peek (1) + fetch opcode (1) + fetch imm (1) + memory write (1) = 4
    step(cpu);
    // Step 2: HALT; now previous step's wait cycles should be 4
    step(cpu);
    expect(cpu.getLastWaitCycles()).toBe(4);
  });
});

