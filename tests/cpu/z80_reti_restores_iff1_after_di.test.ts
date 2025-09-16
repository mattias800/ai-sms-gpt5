import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 RETI restores IFF1 from IFF2 after DI inside ISR', (): void => {
  it('DI clears only IFF1; RETI copies IFF2 back to IFF1', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DI; RETI; HALT
    mem.set([0xf3, 0xed, 0x4d, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Start with IFF1=1, IFF2=1 to simulate interrupts previously enabled
    const st0 = cpu.getState();
    cpu.setState({ ...st0, iff1: true, iff2: true });

    // DI executes: should clear IFF1 only
    expect(step(cpu)).toBe(4);
    let st = cpu.getState();
    expect(st.iff1).toBe(false);
    expect(st.iff2).toBe(true);

    // RETI executes: should restore IFF1 from IFF2 (true)
    expect(step(cpu)).toBe(14);
    st = cpu.getState();
    expect(st.iff1).toBe(true);
    expect(st.iff2).toBe(true);
  });
});
