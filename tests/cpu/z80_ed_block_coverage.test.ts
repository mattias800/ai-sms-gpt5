import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 ED-prefixed and block operation coverage', (): void => {
  it('ED 5A: ADC HL,DE updates HL and takes 15 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x5a], 0x0000); // ADC HL,DE
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // HL=1234h, DE=1111h, C=1 => HL := 1234+1111+1 = 2346h
    cpu.setState({ ...st, h: 0x12, l: 0x34, d: 0x11, e: 0x11, f: (st.f | 0x01) & 0xff });
    const c = step(cpu);
    expect(c).toBe(15);
    const s2 = cpu.getState();
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0x2346);
  });

  it('ED 73: LD (nn),SP stores SP at address, and ED 5B: LD DE,(nn) loads DE', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (4000h),SP; LD DE,(4000h)
    mem.set([0xed, 0x73, 0x00, 0x40, 0xed, 0x5b, 0x00, 0x40], 0x0100);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, sp: 0xbeef, pc: 0x0100 });
    let c = step(cpu);
    expect(c).toBe(20);
    expect(mem[0x4000]).toBe(0xef);
    expect(mem[0x4001]).toBe(0xbe);
    c = step(cpu); // LD DE,(nn)
    expect(c).toBe(20);
    const s2 = cpu.getState();
    expect(s2.d).toBe(0xbe);
    expect(s2.e).toBe(0xef);
  });

  it('ED B0: LDIR repeat path (21 cycles) then final (16 cycles)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at 0200: LDIR
    mem.set([0xed, 0xb0], 0x0200);
    // Source data
    mem[0x2000] = 0xaa;
    mem[0x2001] = 0xbb;
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // HL=2000, DE=2100, BC=0002, A=00
    cpu.setState({
      ...st,
      h: 0x20,
      l: 0x00,
      d: 0x21,
      e: 0x00,
      b: 0x00,
      c: 0x02,
      a: 0x00,
      pc: 0x0200,
    });
    // First iteration: repeat (BC != 0 after decrement) => 21 cycles, PC rewinds to 0200
    let c = step(cpu);
    expect(c).toBe(21);
    expect(cpu.getState().pc).toBe(0x0200);
    // Second iteration: BC becomes 0 => 16 cycles and PC advances to 0202
    c = step(cpu);
    expect(c).toBe(16);
    const s2 = cpu.getState();
    expect(s2.pc).toBe(0x0202);
    // Verify bytes copied and pointers updated
    expect(mem[0x2100]).toBe(0xaa);
    expect(mem[0x2101]).toBe(0xbb);
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0x2002);
    expect(((s2.d << 8) | s2.e) & 0xffff).toBe(0x2102);
    expect(((s2.b << 8) | s2.c) & 0xffff).toBe(0x0000);
  });

  it('ED B1: CPIR repeat path then stop when match found', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at 0300: CPIR
    mem.set([0xed, 0xb1], 0x0300);
    // Buffer
    mem[0x3000] = 0xaa;
    mem[0x3001] = 0xbb;
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // A=BB, HL=3000, BC=0002
    cpu.setState({ ...st, a: 0xbb, h: 0x30, l: 0x00, b: 0x00, c: 0x02, pc: 0x0300 });
    // First step repeats (compare != 0 and BC != 0)
    let c = step(cpu);
    expect(c).toBe(21);
    expect(cpu.getState().pc).toBe(0x0300);
    // Second step should stop (match found), 16 cycles
    c = step(cpu);
    expect(c).toBe(16);
    const s2 = cpu.getState();
    expect(s2.pc).toBe(0x0302);
    expect(((s2.h << 8) | s2.l) & 0xffff).toBe(0x3002);
    expect(((s2.b << 8) | s2.c) & 0xffff).toBe(0x0000);
  });

  it('ED 57: LD A,I sets PV when IFF2=1 and preserves C', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x57], 0x0400);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // I=5A, IFF2=1, C=1
    cpu.setState({ ...st, i: 0x5a, iff2: true, f: (st.f | 0x01) & 0xff, pc: 0x0400 });
    const c = step(cpu);
    expect(c).toBe(9);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x5a);
    expect((f & 0x04) !== 0).toBe(true); // PV set
    expect((f & 0x01) !== 0).toBe(true); // C preserved
  });

  it('ED 5F: LD A,R clears PV when IFF2=0 and preserves C', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x5f], 0x0500);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // R=12, IFF2=0, C=1
    cpu.setState({ ...st, r: 0x12, iff2: false, f: (st.f | 0x01) & 0xff, pc: 0x0500 });
    const c = step(cpu);
    expect(c).toBe(9);
    const f = cpu.getState().f;
    // R increments on each fetch (ED + 5F) => +2 in low 7 bits
    expect(cpu.getState().a).toBe(0x14);
    expect((f & 0x04) === 0).toBe(true); // PV cleared
    expect((f & 0x01) !== 0).toBe(true); // C preserved
  });

  it('ED 4D: RETI pops PC and sets IFF1 := IFF2 (same as RETN)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x4d], 0x0610);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, sp: 0x8000, iff2: true, pc: 0x0610 });
    mem[0x8000] = 0x78; // lo
    mem[0x8001] = 0x56; // hi
    const c = step(cpu);
    expect(c).toBe(14);
    expect(cpu.getState().pc).toBe(0x5678);
    expect(cpu.getState().iff1).toBe(true);
  });

  it('ED 45: RETN pops PC and sets IFF1 := IFF2', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x45], 0x0600);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // Preload stack with 0x3456 and IFF2=false, SP=8000
    cpu.setState({ ...st, sp: 0x8000, iff2: false, pc: 0x0600 });
    mem[0x8000] = 0x56;
    mem[0x8001] = 0x34;
    const c = step(cpu);
    expect(c).toBe(14);
    expect(cpu.getState().pc).toBe(0x3456);
    expect(cpu.getState().iff1).toBe(false);
  });
  it('ED 47: LD I,A and ED 4F: LD R,A update special registers and take 9 cycles each', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD A,0x33; LD I,A; LD A,0x77; LD R,A
    mem.set([0x3e, 0x33, 0xed, 0x47, 0x3e, 0x77, 0xed, 0x4f], 0x0700);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0700 });
    // LD A,0x33
    expect(step(cpu)).toBe(7);
    // LD I,A
    expect(step(cpu)).toBe(9);
    expect(cpu.getState().i).toBe(0x33);
    // LD A,0x77
    expect(step(cpu)).toBe(7);
    // LD R,A
    expect(step(cpu)).toBe(9);
    expect(cpu.getState().r & 0x7f).toBe(0x77 & 0x7f);
  });

  it('ED 66: IM0 via alternate encoding and IRQ vector to default 0x0038', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // IM 0 (ED 66); EI; NOP; HALT
    mem.set([0xed, 0x66, 0xfb, 0x00, 0x76], 0x0800);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0800 });
    // IM0
    expect(step(cpu)).toBe(8);
    // EI
    expect(step(cpu)).toBe(4);
    // Queue IRQ and run NOP then HALT
    cpu.requestIRQ();
    expect(step(cpu)).toBe(4);
    expect(step(cpu)).toBe(4);
    const c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0038);
  });
});
