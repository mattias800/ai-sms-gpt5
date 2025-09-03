import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 EI timing and IRQ acceptance', (): void => {
  it('IRQ is accepted after the instruction following EI (IM1 default)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; NOP; (then we expect an IRQ to be accepted and jump to 0x0038)
    mem.set([0xfb, 0x00], 0x0000);
    const cpu = createZ80({ bus });

    // Request IRQ before executing EI
    cpu.requestIRQ();

    // EI executes (4 cycles), does not accept IRQ yet
    let c = step(cpu);
    expect(c).toBe(4);
    // Next instruction executes (NOP), still no IRQ acceptance during this instruction
    c = step(cpu);
    expect(c).toBe(4);

    // Now IRQ should be accepted, push PC=0x0002 and jump to 0x0038 (13 cycles IM1)
    const res = cpu.stepOne();
    expect(res.cycles).toBe(13);
    const st = cpu.getState();
    expect(st.pc).toBe(0x0038);
  });
});
