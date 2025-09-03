import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IM0 unsupported injected opcode (not halted path)', (): void => {
  it('throws when IM0 injected opcode is unsupported and CPU is not halted', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: IM 0; EI; CP 00h; NOP
    // After CP, EI pending is committed; next step (before executing NOP) accepts IRQ in not-halted path
    mem.set([0xed, 0x46, 0xfb, 0xfe, 0x00, 0x00], 0x0000);
    const cpu = createZ80({ bus });

    // IM0
    step(cpu);
    // EI
    step(cpu);
    // CP 00h (commits EI pending)
    step(cpu);

    // Configure IM0 to use an unsupported injected opcode (NOP 0x00)
    cpu.setIM0Opcode(0x00);

    // Request IRQ; acceptance should happen in not-halted path and throw
    cpu.requestIRQ();
    expect((): void => {
      cpu.stepOne();
    }).toThrowError(/IM0 unsupported opcode/);
  });
});
