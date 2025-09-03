import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

describe('Z80 DI instruction', (): void => {
  it('clears IFF1 and IFF2 and takes 4 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xf3, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    cpu.setState({ ...st0, iff1: true, iff2: true });
    const c = cpu.stepOne().cycles;
    expect(c).toBe(4);
    const st = cpu.getState();
    expect(st.iff1).toBe(false);
    expect(st.iff2).toBe(false);
  });
});
