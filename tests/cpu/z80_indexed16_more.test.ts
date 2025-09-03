import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IX/IY 16-bit basics: INC/DEC, ADD IX/IY,pp, LD SP,IX/IY, EX (SP),IY', (): void => {
  it('INC IX and DEC IY take 10 cycles and update registers', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xdd, 0x23, 0xfd, 0x2b], 0x0000);
    const cpu = createZ80({ bus });
    // Seed IX and IY
    let st = cpu.getState();
    cpu.setState({ ...st, ix: 0x1000, iy: 0x2000 });
    let c = step(cpu); expect(c).toBe(10); // INC IX
    st = cpu.getState();
    expect(st.ix).toBe(0x1001);
    c = step(cpu); expect(c).toBe(10); // DEC IY
    st = cpu.getState();
    expect(st.iy).toBe(0x1fff);
  });

  it('ADD IX,SP and LD SP,IY and EX (SP),IY', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // DD 39 (ADD IX,SP); FD F9 (LD SP,IY); FD E3 (EX (SP),IY)
    mem.set([0xdd, 0x39, 0xfd, 0xf9, 0xfd, 0xe3], 0x0000);
    const cpu = createZ80({ bus });
    // Seed IX and SP
    let st = cpu.getState();
    cpu.setState({ ...st, ix: 0x1234, sp: 0x0100, iy: 0x9000 });
    let c = step(cpu); expect(c).toBe(15);
    st = cpu.getState();
    expect(st.ix).toBe(0x1334);

    // LD SP,IY
    c = step(cpu); expect(c).toBe(10);
    st = cpu.getState();
    expect(st.sp).toBe(0x9000);

    // Prepare stack contents and EX (SP),IY
    const memArr = bus.getMemory();
    memArr[0x9000] = 0x78; // low
    memArr[0x9001] = 0x56; // high
    // EX (SP),IY swaps IY with (SP)
    c = step(cpu); expect(c).toBe(23);
    st = cpu.getState();
    expect(st.iy).toBe(0x5678);
    expect(memArr[0x9000]).toBe(0x00); // previous IY low
    expect(memArr[0x9001]).toBe(0x90); // previous IY high
  });
});

