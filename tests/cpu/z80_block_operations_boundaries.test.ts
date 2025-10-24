import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_PV, FLAG_H, FLAG_N } from '../../src/cpu/z80/flags.js';

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
    sp?: number;
    pc?: number;
    i?: number;
    r?: number;
  }>
): void => {
  const s = cpu.getState();
  const updates = { ...regs };
  cpu.setState({ ...s, ...(updates as any) });
};

describe('Z80 block operations boundary conditions', (): void => {
  it('LDIR with BC=0: copies one byte then exits', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDIR; HALT
    mem.set([0xed, 0xb0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x00, a: 0x00, f: 0x00 });
    mem[0x4000] = 0xaa;

    // LDIR with BC=0 copies one byte
    const c = step(cpu);
    expect(c).toBe(16); // Single iteration, no repeat
    const st = cpu.getState();
    expect(mem[0x2000]).toBe(0xaa);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0xffff); // BC wraps to FFFF
    expect((st.h << 8) | st.l).toBe(0x4001);
    expect((st.d << 8) | st.e).toBe(0x2001);
  });

  it('LDI with BC=0: copies one byte, BC becomes FFFF, PV cleared', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDI; HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x00, a: 0x00, f: 0x00 });
    mem[0x4000] = 0xbb;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(mem[0x2000]).toBe(0xbb);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0xffff); // BC decremented from 0 wraps to FFFF
    // PV cleared because BC became 0 (after decrement)
    expect((st.f & FLAG_PV) !== 0).toBe(false);
  });

  it('CPIR with BC=0: compares one byte, then exits', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPIR; HALT
    mem.set([0xed, 0xb1, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, a: 0x55, b: 0x00, c: 0x00, f: 0x00 });
    mem[0x4000] = 0x55; // Match

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4001);
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0xffff);
    // Z flag set (match found)
    expect((st.f & 0x40) !== 0).toBe(true);
  });

  it('CPI with BC=1: compares one byte, BC becomes 0, PV cleared', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPI; HALT
    mem.set([0xed, 0xa1, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, a: 0x42, b: 0x00, c: 0x01, f: 0x00 });
    mem[0x4000] = 0x42;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    // PV cleared because BC becomes 0
    expect((st.f & FLAG_PV) !== 0).toBe(false);
  });

  it('BC wraps from 0x0001 to 0x0000 during decrement', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDI; HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x01, a: 0x00, f: 0x00 });
    mem[0x4000] = 0xcc;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000); // BC was 0x0001, now 0x0000
    // PV cleared since BC is now 0
    expect((st.f & FLAG_PV) !== 0).toBe(false);
  });

  it('DE wraps around 16-bit boundary during block transfer', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDI; HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // DE at 0xFFFF - should wrap to 0x0000 on increment
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0xff, e: 0xff, b: 0x00, c: 0x01, a: 0x00, f: 0x00 });
    mem[0x4000] = 0xdd;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.d << 8) | st.e).toBe(0x0000); // DE wrapped from 0xFFFF to 0x0000
  });

  it('HL wraps around 16-bit boundary during block transfer', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDI; HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // HL at 0xFFFF - should wrap to 0x0000 on increment
    setRegs(cpu, { h: 0xff, l: 0xff, d: 0x20, e: 0x00, b: 0x00, c: 0x01, a: 0x00, f: 0x00 });
    mem[0xffff] = 0xee;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x0000); // HL wrapped from 0xFFFF to 0x0000
  });

  it('LDIR copies entire memory range (BC=2) with correct timing', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDIR; HALT
    mem.set([0xed, 0xb0, 0x76], 0x0000);
    mem[0x4000] = 0x11;
    mem[0x4001] = 0x22;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x02, a: 0x00, f: 0x00 });

    // First iteration (repeat): 21 cycles
    let c = step(cpu);
    expect(c).toBe(21);
    expect(mem[0x2000]).toBe(0x11);

    // Second iteration (final): 16 cycles
    c = step(cpu);
    expect(c).toBe(16);
    expect(mem[0x2001]).toBe(0x22);

    const st = cpu.getState();
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    expect((st.h << 8) | st.l).toBe(0x4002);
    expect((st.d << 8) | st.e).toBe(0x2002);
  });

  it('LDDR copies entire memory range backwards (BC=2) with correct timing', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDDR; HALT
    mem.set([0xed, 0xb8, 0x76], 0x0000);
    mem[0x4000] = 0x11;
    mem[0x4001] = 0x22;
    const cpu = createZ80({ bus });
    // Start from end and work backwards
    setRegs(cpu, { h: 0x40, l: 0x01, d: 0x20, e: 0x01, b: 0x00, c: 0x02, a: 0x00, f: 0x00 });

    // First iteration (repeat): 21 cycles
    let c = step(cpu);
    expect(c).toBe(21);
    expect(mem[0x2001]).toBe(0x22);

    // Second iteration (final): 16 cycles
    c = step(cpu);
    expect(c).toBe(16);
    expect(mem[0x2000]).toBe(0x11);

    const st = cpu.getState();
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
    expect((st.h << 8) | st.l).toBe(0x3fff);
    expect((st.d << 8) | st.e).toBe(0x1fff);
  });

  it('CPIR with match found: Z flag set, PV set (if BC != 0 after match)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPIR; HALT
    mem.set([0xed, 0xb1, 0x76], 0x0000);
    mem[0x4000] = 0x99;
    mem[0x4001] = 0x88; // Match at position 2
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, a: 0x88, b: 0x00, c: 0x03, f: 0x00 });

    // First iteration (repeat):
    let c = step(cpu);
    expect(c).toBe(21); // Repeat (no match, BC was 3, now 2)

    // Continue stepping until match or timeout
    c = step(cpu);
    expect(c).toBe(16); // Match found, exit

    const st = cpu.getState();
    // Z flag should be set (comparison match)
    expect((st.f & 0x40) !== 0).toBe(true);
  });

  it('OUTIR with BC edge case: copy from memory to I/O port', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: OUTIR; HALT
    // Note: OUTIR is ED B3
    mem.set([0xed, 0xb3, 0x76], 0x0000);
    mem[0x4000] = 0x55;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, b: 0x00, c: 0x01, a: 0x00, f: 0x00 });

    // OUTIR with BC=1 should output once
    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect(((st.b << 8) | st.c) & 0xffff).toBe(0x0000);
  });

  it('Block operations maintain H and N flags correctly', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDI; HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x01, a: 0x55, f: 0xff });
    mem[0x4000] = 0x11;

    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    // H flag should be cleared
    expect((st.f & FLAG_H) !== 0).toBe(false);
    // N flag should be cleared
    expect((st.f & FLAG_N) !== 0).toBe(false);
  });

  it('LDIR with interrupt pending: respects interrupt priority', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDIR; HALT
    mem.set([0xed, 0xb0, 0x76], 0x0000);
    mem[0x4000] = 0x11;
    mem[0x4001] = 0x22;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x02, a: 0x00, f: 0x00, sp: 0x1000 });

    // Enable interrupts
    const st = cpu.getState();
    cpu.setState({ ...st, iff1: true, iff2: true });

    // Post interrupt request before LDIR starts
    cpu.requestIRQ();

    // LDIR should not be interrupted mid-instruction
    let c = step(cpu);
    expect(c).toBe(21); // Completes first iteration despite pending interrupt
    expect(mem[0x2000]).toBe(0x11);

    // Second iteration: 16 cycles
    c = step(cpu);
    expect(c).toBe(16);
    expect(mem[0x2001]).toBe(0x22);

    // Now interrupt should be serviced on next instruction
    const st2 = cpu.getState();
    expect(((st2.b << 8) | st2.c) & 0xffff).toBe(0x0000);
  });

  it('CPDR with no match found: Z flag cleared after exhausting BC', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CPDR; HALT
    mem.set([0xed, 0xb9, 0x76], 0x0000);
    mem[0x4001] = 0x99; // No match
    mem[0x4000] = 0x88;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x01, a: 0x55, b: 0x00, c: 0x02, f: 0x00 });

    // First iteration (repeat)
    let c = step(cpu);
    expect(c).toBe(21);

    // Second iteration (final, no match)
    c = step(cpu);
    expect(c).toBe(16);

    const st = cpu.getState();
    // Z flag should be cleared (no match found)
    expect((st.f & 0x40) !== 0).toBe(false);
  });
});
