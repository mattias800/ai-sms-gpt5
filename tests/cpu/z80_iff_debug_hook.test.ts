import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

describe('Z80 onIFFChange debug hook', (): void => {
  it('fires for EI commit, DI, IRQ accept, and RETI', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; NOP; DI; EI; NOP; RETI
    mem.set([0xfb, 0x00, 0xf3, 0xfb, 0x00, 0xed, 0x4d], 0x0000);

    const events: { iff1: boolean; iff2: boolean; pc: number; reason: string }[] = [];
    const cpu = createZ80({
      bus,
      debugHooks: {
        onIFFChange: (iff1, iff2, pc, reason): void => {
          events.push({ iff1, iff2, pc, reason });
        },
      },
    });

    // Install a trivial IM1 ISR at 0x0038: RETI
    mem[0x0038] = 0xed;
    mem[0x0039] = 0x4d;

    // Step EI (sets pending), then NOP (commits EI)
    cpu.stepOne();
    cpu.stepOne();
    // DI
    cpu.stepOne();
    // EI (pending again), NOP to commit
    cpu.stepOne();
    cpu.stepOne();
    // Simulate an IRQ acceptance so IFF1 clears and vectors to 0x0038
    cpu.requestIRQ();
    cpu.stepOne();
    // Now at 0x0038: RETI restores IFF1 from IFF2
    cpu.stepOne();

    expect(events.some(e => e.reason.startsWith('EI-commit'))).toBe(true);
    expect(events.some(e => e.reason === 'DI')).toBe(true);
    expect(events.some(e => e.reason === 'IRQ-accept')).toBe(true);
    expect(events.some(e => e.reason === 'RETI')).toBe(true);
  });
});
