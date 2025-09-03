import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 DEC BC branch coverage', (): void => {
  it('DEC BC decrements BC correctly (6 cycles)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD BC,0x1000; DEC BC
    mem.set([0x01, 0x00, 0x10, 0x0b], 0x0000);
    const cpu = createZ80({ bus });

    let c = step(cpu);
    expect(c).toBe(10); // LD BC,nn
    const c2 = step(cpu);
    expect(c2).toBe(6); // DEC BC
    const st = cpu.getState();
    expect(st.b).toBe(0x0f);
    expect(st.c).toBe(0xff);
  });
});
