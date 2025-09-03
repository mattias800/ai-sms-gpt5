import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Misc branch coverage: EX DE,HL and JP (IX/IY)', (): void => {
  it('EX DE,HL swaps DE and HL', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xeb], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // HL=0x1234, DE=0xABCD
    cpu.setState({ ...st, h: 0x12, l: 0x34, d: 0xab, e: 0xcd });
    const c = step(cpu);
    expect(c).toBe(4);
    const s2 = cpu.getState();
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0xabcd);
    expect(((s2.d << 8) | s2.e) & 0xffff).toBe(0x1234);
  });

  it('DD JP (IX) and FD JP (IY) set PC and take 8 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // DD E9; FD E9
    mem.set([0xdd, 0xe9, 0xfd, 0xe9], 0x0000);
    const cpu = createZ80({ bus });
    // Set IX and IY to recognizable values
    const st = cpu.getState();
    cpu.setState({ ...st, ix: 0x1111, iy: 0x2222 });

    let c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x1111);

    // Next opcode at 0x1111 is FD E9; place it there and run
    mem.set([0xfd, 0xe9], 0x1111);
    c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x2222);
  });
});

