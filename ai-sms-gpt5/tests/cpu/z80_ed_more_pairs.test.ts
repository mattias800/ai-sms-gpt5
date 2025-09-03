import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

// Additional ED pair-move and block-decrement tests to improve branch coverage.

describe('Z80 ED pair load/store variants and decrementing block ops', (): void => {
  it('ED 43: LD (nn),BC and ED 4B: LD BC,(nn)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (4000h),BC ; LD BC,(4000h)
    mem.set([0xed, 0x43, 0x00, 0x40, 0xed, 0x4b, 0x00, 0x40], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, b: 0x12, c: 0x34 });
    let c = step(cpu);
    expect(c).toBe(20);
    expect(mem[0x4000]).toBe(0x34);
    expect(mem[0x4001]).toBe(0x12);
    c = step(cpu);
    expect(c).toBe(20);
    const s2 = cpu.getState();
    expect(s2.b).toBe(0x12);
    expect(s2.c).toBe(0x34);
  });

  it('ED 63: LD (nn),HL and ED 6B: LD HL,(nn)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (4100h),HL ; LD HL,(4100h)
    mem.set([0xed, 0x63, 0x00, 0x41, 0xed, 0x6b, 0x00, 0x41], 0x0100);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, h: 0xab, l: 0xcd, pc: 0x0100 });
    let c = step(cpu);
    expect(c).toBe(20);
    expect(mem[0x4100]).toBe(0xcd);
    expect(mem[0x4101]).toBe(0xab);
    c = step(cpu);
    expect(c).toBe(20);
    const s2 = cpu.getState();
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0xabcd);
  });

  it('ED B8: LDDR repeat then finalize with BC=0 and decremented HL/DE', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LDDR at 0200
    mem.set([0xed, 0xb8], 0x0200);
    mem[0x2201] = 0x11;
    mem[0x2200] = 0x22;
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({
      ...st,
      h: 0x22,
      l: 0x01,
      d: 0x23,
      e: 0x01,
      b: 0x00,
      c: 0x02,
      a: 0x00,
      pc: 0x0200,
    });
    // First iteration repeats (BC!=0)
    let c = step(cpu);
    expect(c).toBe(21);
    expect(cpu.getState().pc).toBe(0x0200);
    // Second iteration completes
    c = step(cpu);
    expect(c).toBe(16);
    const s2 = cpu.getState();
    expect(mem[0x2301]).toBe(0x11);
    expect(mem[0x2300]).toBe(0x22);
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0x21ff);
    expect(((s2.d << 8) | s2.e) & 0xffff).toBe(0x22ff);
    expect(((s2.b << 8) | s2.c) & 0xffff).toBe(0x0000);
  });

  it('ED 53: LD (nn),DE and ED 7B: LD SP,(nn)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (4200h),DE ; LD SP,(4200h)
    mem.set([0xed, 0x53, 0x00, 0x42, 0xed, 0x7b, 0x00, 0x42], 0x0180);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, d: 0xde, e: 0xad, pc: 0x0180 });
    let c = step(cpu);
    expect(c).toBe(20);
    expect(mem[0x4200]).toBe(0xad);
    expect(mem[0x4201]).toBe(0xde);
    c = step(cpu);
    expect(c).toBe(20);
    expect(cpu.getState().sp).toBe(0xdead);
  });

  it('ED B9: CPDR repeats until match, then stops', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // CPDR at 0300
    mem.set([0xed, 0xb9], 0x0300);
    mem[0x2201] = 0x11;
    mem[0x2200] = 0x22;
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x22, h: 0x22, l: 0x01, b: 0x00, c: 0x02, pc: 0x0300 });
    // First iteration repeats (not matched, BC!=0)
    let c = step(cpu);
    expect(c).toBe(21);
    expect(cpu.getState().pc).toBe(0x0300);
    // Second iteration should stop on match (BC may be nonzero but r==0 stops), 16 cycles
    c = step(cpu);
    expect(c).toBe(16);
    const s2 = cpu.getState();
    expect(s2.pc).toBe(0x0302);
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0x21ff);
  });
});
