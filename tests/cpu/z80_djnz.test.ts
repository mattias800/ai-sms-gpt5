import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 DJNZ relative branch', (): void => {
  it('DJNZ d taken when B-1 != 0 (13 cycles), not taken when becomes 0 (8 cycles)', (): void => {
    // Taken case
    const bus1 = new SimpleBus();
    const mem1 = bus1.getMemory();
    // DJNZ +2; NOP; NOP
    mem1.set([0x10, 0x02, 0x00, 0x00], 0x0000);
    const cpu1 = createZ80({ bus: bus1 });
    const st1 = cpu1.getState();
    cpu1.setState({ ...st1, b: 0x02 });
    let c = step(cpu1);
    expect(c).toBe(13);
    expect(cpu1.getState().pc).toBe(0x0004); // 2 + 2

    // Not taken case
    const bus2 = new SimpleBus();
    const mem2 = bus2.getMemory();
    mem2.set([0x10, 0x02, 0x00, 0x00], 0x0000);
    const cpu2 = createZ80({ bus: bus2 });
    const st2 = cpu2.getState();
    cpu2.setState({ ...st2, b: 0x01 });
    c = step(cpu2);
    expect(c).toBe(8);
    expect(cpu2.getState().pc).toBe(0x0002);
  });
});

