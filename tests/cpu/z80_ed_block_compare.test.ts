import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_H, FLAG_N, FLAG_PV, FLAG_S, FLAG_Z } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

const setRegs = (
  cpu: ReturnType<typeof createZ80>,
  regs: Partial<{
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    h: number;
    l: number;
    f: number;
  }>
): void => {
  const s = cpu.getState();
  cpu.setState({ ...s, ...regs });
};

describe('Z80 ED block compare: CPI/CPD/CPIR/CPDR', (): void => {
  it('CPI compares A with (HL), updates HL++, BC--, flags, cycles 16, preserves C', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPI; HALT
    mem.set([0xed, 0xa1, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { a: 0x22, h: 0x40, l: 0x00, b: 0x00, c: 0x02, f: FLAG_C }); // C set to check preserved
    mem[0x4000] = 0x22; // equal -> Z set

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4001);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0001);
    expect((st.f & FLAG_Z) !== 0).toBe(true);
    expect((st.f & FLAG_S) !== 0).toBe(false);
    expect((st.f & FLAG_N) !== 0).toBe(true);
    expect((st.f & FLAG_H) !== 0).toBe(false);
    expect((st.f & FLAG_C) !== 0).toBe(true); // preserved
    // PV should reflect BC != 0 (after dec), so 1
    expect((st.f & FLAG_PV) !== 0).toBe(true);
  });

  it('CPD compares with (HL), HL--, BC--, flags, cycles 16', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPD; HALT
    mem.set([0xed, 0xa9, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { a: 0x10, h: 0x40, l: 0x01, b: 0x00, c: 0x01, f: 0x00 });
    mem[0x4001] = 0x20; // mismatch -> Z=0, possibly S depending

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4000);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    expect((st.f & FLAG_N) !== 0).toBe(true);
    expect((st.f & FLAG_PV) !== 0).toBe(false); // BC now 0
  });

  it('CPIR repeats until match with 21 cycles on repeats then 16 on last', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPIR; HALT
    mem.set([0xed, 0xb1, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { a: 0x33, h: 0x40, l: 0x00, b: 0x00, c: 0x02, f: 0x00 });
    mem[0x4000] = 0x11; // first mismatch -> repeat
    mem[0x4001] = 0x33; // match -> stop

    let c = step(cpu);
    expect(c).toBe(21);
    c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.f & FLAG_Z) !== 0).toBe(true);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    expect((st.h << 8) | st.l).toBe(0x4002);
  });

  it('CPDR repeats downwards until match', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPDR; HALT
    mem.set([0xed, 0xb9, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { a: 0xaa, h: 0x40, l: 0x01, b: 0x00, c: 0x02, f: 0x00 });
    mem[0x4001] = 0x11; // first mismatch
    mem[0x4000] = 0xaa; // match second

    let c = step(cpu);
    expect(c).toBe(21);
    c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.f & FLAG_Z) !== 0).toBe(true);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    expect((st.h << 8) | st.l).toBe(0x3fff);
  });
});
