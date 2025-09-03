import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_PV, FLAG_3, FLAG_5, FLAG_H, FLAG_N } from '../../src/cpu/z80/flags.js';

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
  }>,
): void => {
  const s = cpu.getState();
  cpu.setState({ ...s, ...regs });
};

describe('Z80 ED block transfer: LDI/LDD/LDIR/LDDR', (): void => {
  it('LDI copies byte, updates HL/DE++, BC--, flags and cycles (16)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDI; HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x02, a: 0x10, f: 0xff });
    mem[0x4000] = 0x22;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(mem[0x2000]).toBe(0x22);
    expect((st.h << 8) | st.l).toBe(0x4001);
    expect((st.d << 8) | st.e).toBe(0x2001);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0001);
    // Flags: H=0, N=0
    expect((st.f & FLAG_H) !== 0).toBe(false);
    expect((st.f & FLAG_N) !== 0).toBe(false);
    // PV set since BC != 0
    expect((st.f & FLAG_PV) !== 0).toBe(true);
    // 3/5 from A+val = 0x10 + 0x22 = 0x32 (bits 5 and no 3?) -> 0x20 set, 0x08 cleared
    expect((st.f & FLAG_5) !== 0).toBe(true);
    expect((st.f & FLAG_3) !== 0).toBe(false);
  });

  it('LDD copies byte, updates HL/DE--, BC--, flags and cycles (16)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDD; HALT
    mem.set([0xed, 0xa8, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x01, d: 0x20, e: 0x01, b: 0x00, c: 0x01, a: 0x08, f: 0x00 });
    mem[0x4001] = 0x01;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(mem[0x2001]).toBe(0x01);
    expect((st.h << 8) | st.l).toBe(0x4000);
    expect((st.d << 8) | st.e).toBe(0x2000);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    // Flags: PV cleared (BC==0), H,N reset
    expect((st.f & FLAG_PV) !== 0).toBe(false);
    expect((st.f & FLAG_H) !== 0).toBe(false);
    expect((st.f & FLAG_N) !== 0).toBe(false);
    // 3/5 from A+val = 0x08 + 0x01 = 0x09 -> bit3 set, bit5 cleared
    expect((st.f & FLAG_3) !== 0).toBe(true);
    expect((st.f & FLAG_5) !== 0).toBe(false);
  });

  it('LDIR repeats until BC==0 with 21 cycles when repeating then 16 on last', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDIR; HALT
    mem.set([0xed, 0xb0, 0x76], 0x0000);
    // Source at 0x4000..0x4001 -> 0x11, 0x22
    mem[0x4000] = 0x11;
    mem[0x4001] = 0x22;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x02, a: 0x00, f: 0x00 });

    let c = step(cpu);
    expect(c).toBe(21); // repeat
    c = step(cpu);
    expect(c).toBe(16); // last
    const st = cpu.getState();
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0);
    expect(mem[0x2000]).toBe(0x11);
    expect(mem[0x2001]).toBe(0x22);
    expect((st.h << 8) | st.l).toBe(0x4002);
    expect((st.d << 8) | st.e).toBe(0x2002);
  });

  it('LDDR repeats decrementing until BC==0 with expected cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDDR; HALT
    mem.set([0xed, 0xb8, 0x76], 0x0000);
    mem[0x4000] = 0xaa;
    mem[0x4001] = 0xbb;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x01, d: 0x20, e: 0x01, b: 0x00, c: 0x02, a: 0x00, f: 0x00 });

    let c = step(cpu);
    expect(c).toBe(21);
    c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(mem[0x2001]).toBe(0xbb);
    expect(mem[0x2000]).toBe(0xaa);
    expect((st.h << 8) | st.l).toBe(0x3fff);
    expect((st.d << 8) | st.e).toBe(0x1fff);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0);
  });
});
