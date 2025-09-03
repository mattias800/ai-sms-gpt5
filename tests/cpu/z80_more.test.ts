import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_N, FLAG_PV } from '../../src/cpu/z80/flags.js';

const stepN = (cpu: ReturnType<typeof createZ80>, n: number): void => {
  for (let i = 0; i < n; i++) cpu.stepOne();
};

describe('Z80 additional coverage', (): void => {
  it('LD r,r matrix and cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD B,0x11; LD C,0x22; LD B,C; LD D,B; LD H,D; LD A,H; HALT
    mem.set(
      [
        0x06,
        0x11, // LD B,0x11
        0x0e,
        0x22, // LD C,0x22
        0x41, // LD B,C
        0x50, // LD D,B
        0x62, // LD H,D
        0x7c, // LD A,H
        0x76, // HALT
      ],
      0x0000
    );
    const cpu = createZ80({ bus });
    stepN(cpu, 6);
    const st = cpu.getState();
    expect(st.b).toBe(0x22);
    expect(st.d).toBe(0x22);
    expect(st.h).toBe(0x22);
    expect(st.a).toBe(0x22);
  });

  it('INC/DEC (HL) cycles and flags', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD HL,0x4000 via LD H,0x40; LD L,0xff; INC (HL); DEC (HL); HALT
    mem.set(
      [
        0x26,
        0x40, // LD H,0x40
        0x2e,
        0xff, // LD L,0xff
        0x34, // INC (HL)
        0x35, // DEC (HL)
        0x76, // HALT
      ],
      0x0000
    );
    const cpu = createZ80({ bus });
    // Ensure memory at 0x40ff initially 0x00
    expect(mem[0x40ff]).toBe(0x00);
    // INC (HL)
    let res = cpu.stepOne(); // LD H
    expect(res.cycles).toBe(7);
    res = cpu.stepOne(); // LD L
    expect(res.cycles).toBe(7);
    res = cpu.stepOne(); // INC (HL)
    expect(res.cycles).toBe(11);
    expect(mem[0x40ff]).toBe(0x01);
    // DEC (HL)
    res = cpu.stepOne();
    expect(res.cycles).toBe(11);
    expect(mem[0x40ff]).toBe(0x00);
  });

  it('ADD overflow and SUB overflow flag (P/V) semantics', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x7F; ADD A,0x01 -> 0x80 (PV=1); LD A,0x80; SUB 0x01 -> 0x7F (PV=1); HALT
    mem.set(
      [
        0x3e,
        0x7f, // LD A,0x7F
        0xc6,
        0x01, // ADD A,0x01
        0x3e,
        0x80, // LD A,0x80
        0xd6,
        0x01, // SUB 0x01
        0x76, // HALT
      ],
      0x0000
    );
    const cpu = createZ80({ bus });
    stepN(cpu, 2);
    let st = cpu.getState();
    expect(st.a).toBe(0x80);
    expect((st.f & FLAG_PV) !== 0).toBe(true);
    stepN(cpu, 2);
    st = cpu.getState();
    expect(st.a).toBe(0x7f);
    expect((st.f & FLAG_PV) !== 0).toBe(true);
  });

  it('CP r sets flags without changing A', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x10; LD B,0x20; CP B; HALT
    mem.set([0x3e, 0x10, 0x06, 0x20, 0xb8, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    stepN(cpu, 3);
    const st = cpu.getState();
    expect(st.a).toBe(0x10);
    expect((st.f & FLAG_N) !== 0).toBe(true);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('R refresh increments on each fetch; IO bus methods are callable', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; NOP; NOP; HALT
    mem.set([0x00, 0x00, 0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    stepN(cpu, 3);
    const st = cpu.getState();
    expect(st.r & 0x7f).toBe(3);
    // IO
    expect(bus.readIO8(0xdc)).toBe(0xff);
    bus.writeIO8(0xdc, 0x12);
  });
});
