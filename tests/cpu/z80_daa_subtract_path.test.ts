import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_H, FLAG_N } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 DAA subtract path (N=1) coverage', (): void => {
  it('DAA after subtraction with H=1 adjusts by -0x06', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x27], 0x0000); // DAA
    const cpu = createZ80({ bus });
    // Simulate A=0x0f after a BCD subtraction with half-borrow
    const s0 = cpu.getState();
    cpu.setState({ ...s0, a: 0x0f, f: FLAG_N | FLAG_H });
    const c = step(cpu);
    expect(c).toBe(4);
    const st = cpu.getState();
    expect(st.a).toBe(0x09); // 0x0f - 0x06
    expect((st.f & FLAG_N) !== 0).toBe(true); // N remains set
    expect((st.f & FLAG_H) !== 0).toBe(false); // H cleared after adjust
  });
});
