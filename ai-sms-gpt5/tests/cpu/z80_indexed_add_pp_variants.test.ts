import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IX/IY ADD pp variants', (): void => {
  it('ADD IY,BC and ADD IY,SP update correctly', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // FD 09 (ADD IY,BC); FD 39 (ADD IY,SP)
    mem.set([0xfd, 0x09, 0xfd, 0x39], 0x0000);
    const cpu = createZ80({ bus });
    let st = cpu.getState();
    // Seed IY=0x1000, BC=0x0001, SP=0x0010
    cpu.setState({ ...st, iy: 0x1000, b: 0x00, c: 0x01, sp: 0x0010 });
    let c = step(cpu); expect(c).toBe(15); // ADD IY,BC
    st = cpu.getState();
    expect(st.iy).toBe(0x1001);
    c = step(cpu); expect(c).toBe(15); // ADD IY,SP
    st = cpu.getState();
    expect(st.iy).toBe(0x1011);
  });
});

