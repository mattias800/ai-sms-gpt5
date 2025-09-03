import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_S, FLAG_Z } from '../../src/cpu/z80/flags.js';

describe('Z80 CB rotate/shift variant coverage', (): void => {
  it('RRC C, RR E(with carry), SLA H, SRA L, SLL A', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program:
    // LD C,0x02; RRC C; LD E,0x00; RR E; LD H,0x80; SLA H; LD L,0x81; SRA L; LD A,0x40; SLL A; HALT
    mem.set(
      [
        0x0e, 0x02, 0xcb, 0x09, 0x1e, 0x00, 0xcb, 0x1b, 0x26, 0x80, 0xcb, 0x24, 0x2e, 0x81, 0xcb, 0x2d, 0x3e, 0x40,
        0xcb, 0x37, 0x76,
      ],
      0x0000
    );
    const cpu = createZ80({ bus });

    // LD C, RRC C
    cpu.stepOne();
    cpu.stepOne();
    let st = cpu.getState();
    expect(st.c).toBe(0x01);
    expect((st.f & FLAG_C) !== 0).toBe(false);

    // Set carry before RR E
    st = cpu.getState();
    cpu.setState({ ...st, f: st.f | FLAG_C });

    // LD E, RR E
    cpu.stepOne();
    cpu.stepOne();
    st = cpu.getState();
    expect(st.e).toBe(0x80);
    expect((st.f & FLAG_C) !== 0).toBe(false);
    expect((st.f & FLAG_S) !== 0).toBe(true);

    // LD H, SLA H
    cpu.stepOne();
    cpu.stepOne();
    st = cpu.getState();
    expect(st.h).toBe(0x00);
    expect((st.f & FLAG_C) !== 0).toBe(true);
    expect((st.f & FLAG_Z) !== 0).toBe(true);

    // LD L, SRA L
    cpu.stepOne();
    cpu.stepOne();
    st = cpu.getState();
    expect(st.l).toBe(0xc0);

    // LD A, SLL A
    cpu.stepOne();
    cpu.stepOne();
    st = cpu.getState();
    expect(st.a).toBe(0x81);
  });
});
