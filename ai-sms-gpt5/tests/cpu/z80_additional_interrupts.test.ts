import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 additional interrupt coverage', (): void => {
  it('NMI while halted is accepted on next step and wakes CPU (11 cycles, PC=0x0066)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: HALT
    mem.set([0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Enter HALT
    expect(step(cpu)).toBe(4);
    expect(cpu.getState().halted).toBe(true);

    // Post NMI and accept on next step
    cpu.requestNMI();
    const c = step(cpu);
    expect(c).toBe(11);
    const st = cpu.getState();
    expect(st.halted).toBe(false);
    expect(st.pc).toBe(0x0066);
  });

  it('IM1 IRQ accepted immediately when next instruction is not HALT (preempts NOP)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; EI; NOP; NOP
    mem.set([0x00, 0xfb, 0x00, 0x00], 0x0000);
    const cpu = createZ80({ bus });

    // NOP
    expect(step(cpu)).toBe(4);
    // EI
    expect(step(cpu)).toBe(4);

    // Post IRQ; next instruction runs due to EI delay
    cpu.requestIRQ();
    expect(step(cpu)).toBe(4); // NOP executes (EI delay masks acceptance)

    // Now the next step should accept IRQ immediately (preempt the next NOP)
    const cycles = step(cpu);
    expect(cycles).toBe(13);
    expect(cpu.getState().pc).toBe(0x0038);
  });
});

