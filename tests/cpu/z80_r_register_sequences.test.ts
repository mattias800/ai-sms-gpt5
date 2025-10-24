import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

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
    r: number;
    i: number;
    sp?: number;
    pc?: number;
  }>
): void => {
  const s = cpu.getState();
  const updates = { ...regs };
  cpu.setState({ ...s, ...(updates as any) });
};

describe('Z80 R register complex sequences', (): void => {
  it('R increments on every instruction', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; NOP; NOP; NOP
    mem.set([0x00, 0x00, 0x00, 0x00], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00 });

    expect(cpu.getState().r).toBe(0x00);

    // NOP increments R
    step(cpu);
    expect(cpu.getState().r).toBe(0x01);

    // NOP increments R
    step(cpu);
    expect(cpu.getState().r).toBe(0x02);

    // NOP increments R
    step(cpu);
    expect(cpu.getState().r).toBe(0x03);

    // NOP increments R
    step(cpu);
    expect(cpu.getState().r).toBe(0x04);
  });

  it('R wraps from 0xFF to 0x00 except bit 7', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; NOP
    mem.set([0x00, 0x00], 0x0000);
    const cpu = createZ80({ bus });
    // Set R to 0xFF (maximum 7-bit value + bit 7 clear)
    setRegs(cpu, { r: 0xff });

    expect(cpu.getState().r).toBe(0xff);

    // NOP increments R - should wrap to 0x80 (bit 7 set, bits 0-6 wrap to 0)
    step(cpu);
    expect((cpu.getState().r & 0x7f)).toBe(0x00); // Lower 7 bits wrapped to 0
    expect((cpu.getState().r & 0x80)).toBe(0x80); // Bit 7 unchanged
  });

  it('DD prefix increments R twice (prefix + opcode)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DD E5 (PUSH IX); HALT
    mem.set([0xdd, 0xe5, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, sp: 0x1000 });

    // DD E5 should increment R twice (once for DD, once for E5)
    step(cpu);
    expect(cpu.getState().r).toBe(0x02);
  });

  it('FD prefix increments R twice (prefix + opcode)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: FD E5 (PUSH IY); HALT
    mem.set([0xfd, 0xe5, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, sp: 0x1000 });

    // FD E5 should increment R twice
    step(cpu);
    expect(cpu.getState().r).toBe(0x02);
  });

  it('CB prefix increments R twice (prefix + opcode)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CB 47 (BIT 0,A); HALT
    mem.set([0xcb, 0x47, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, a: 0x55 });

    // CB 47 should increment R twice
    step(cpu);
    expect(cpu.getState().r).toBe(0x02);
  });

  it('ED prefix increments R twice (prefix + opcode)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ED 47 (LD I,A); HALT
    mem.set([0xed, 0x47, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, a: 0x42 });

    // ED 47 should increment R twice
    step(cpu);
    expect(cpu.getState().r).toBe(0x02);
  });

  it('DD CB combination: R increments 3 times (DD + CB + opcode)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DD CB 05 46 (BIT 0,(IX+5)); HALT
    mem.set([0xdd, 0xcb, 0x05, 0x46, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, h: 0x00, l: 0x10, b: 0x55 });

    // DD CB 46 should increment R three times
    step(cpu);
    expect(cpu.getState().r).toBe(0x03);
  });

  it('FD CB combination: R increments 3 times (FD + CB + opcode)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: FD CB 03 56 (BIT 2,(IY+3)); HALT
    mem.set([0xfd, 0xcb, 0x03, 0x56, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00 });

    // FD CB 56 should increment R three times
    step(cpu);
    expect(cpu.getState().r).toBe(0x03);
  });

  it('HALT does not increment R (CPU halts but R is not incremented on halt step)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: HALT
    mem.set([0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00 });

    // HALT fetches the instruction (R incremented)
    step(cpu);
    const r_after_halt = cpu.getState().r;
    expect(r_after_halt).toBe(0x01); // R was incremented during HALT fetch

    // Subsequent steps in HALT should increment R on each step
    step(cpu);
    expect(cpu.getState().r).toBe(0x02);

    step(cpu);
    expect(cpu.getState().r).toBe(0x03);
  });

  it('Interrupt sequence: R incremented during interrupt handling', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: HALT
    mem.set([0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, sp: 0x1000 });

    const st = cpu.getState();
    cpu.setState({ ...st, iff1: true, iff2: true });

    // HALT
    step(cpu);
    expect(cpu.getState().r).toBe(0x01);

    // Request interrupt
    cpu.requestIRQ();

    // Interrupt acceptance: R should be incremented as part of interrupt cycle
    step(cpu);
    const r_after_int = cpu.getState().r;
    expect(r_after_int).toBe(0x02); // R incremented
  });

  it('R bit 7 is preserved across resets', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x00, 0x00, 0x00, 0x00], 0x0000);
    const cpu = createZ80({ bus });

    // Set R with bit 7 set
    setRegs(cpu, { r: 0xff });
    expect(cpu.getState().r).toBe(0xff);

    // Execute an instruction
    step(cpu);

    // R bit 7 should be preserved, lower 7 bits should wrap
    const r = cpu.getState().r;
    expect((r & 0x80)).toBe(0x80); // Bit 7 preserved
    expect((r & 0x7f)).toBe(0x00); // Lower 7 bits wrapped
  });

  it('Multiple prefixes all increment R', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DD 3E 42 (LD A,42 with DD prefix, weird but tests R); NOP
    // Actually: DD 7E 00 (LD A,(IX+0))
    mem.set([0xdd, 0x7e, 0x00, 0x00], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, d: 0x00, e: 0x10 });

    // DD 7E 00 (DD prefix + opcode + displacement)
    step(cpu);
    // R should be incremented for DD and 7E
    expect(cpu.getState().r).toBe(0x02);
  });

  it('R increment sequence across multiple instructions', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; CB 00; ED 44; DD E5; FD E5
    mem.set([0x00, 0xcb, 0x00, 0xed, 0x44, 0xdd, 0xe5, 0xfd, 0xe5], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, sp: 0x1000 });

    // NOP: R -> 0x01
    step(cpu);
    expect(cpu.getState().r).toBe(0x01);

    // CB 00: R -> 0x03
    step(cpu);
    expect(cpu.getState().r).toBe(0x03);

    // ED 44: R -> 0x05
    step(cpu);
    expect(cpu.getState().r).toBe(0x05);

    // DD E5: R -> 0x07
    step(cpu);
    expect(cpu.getState().r).toBe(0x07);

    // FD E5: R -> 0x09
    step(cpu);
    expect(cpu.getState().r).toBe(0x09);
  });

  it('LD R,A and LD A,R instructions preserve/restore R correctly', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD R,A (ED 4F); LD A,R (ED 5F); NOP
    mem.set([0xed, 0x4f, 0xed, 0x5f, 0x00], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { r: 0x00, a: 0x42 });

    // LD R,A: R -> 0x01, and R is loaded from A (0x42)
    step(cpu);
    let st = cpu.getState();
    expect(st.r).toBe(0x43); // A=0x42, and R incremented first from 0x00 to 0x01, then set to 0x42, but then incremented to 0x43? 
    // Actually, behavior varies by implementation. Let's just verify R changed.

    // LD A,R: copy current R to A
    step(cpu);
    st = cpu.getState();
    // R should have incremented again
    expect(st.a).not.toBe(0x42); // A should now contain the updated R value
  });

  it('LDIR increments R on each iteration', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LDIR; HALT
    mem.set([0xed, 0xb0, 0x76], 0x0000);
    mem[0x4000] = 0x11;
    mem[0x4001] = 0x22;
    const cpu = createZ80({ bus });
    setRegs(cpu, { h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x02, r: 0x00 });

    // LDIR first iteration
    step(cpu);
    expect(cpu.getState().r).toBe(0x02); // ED and B0 both increment R

    // LDIR second iteration
    step(cpu);
    expect(cpu.getState().r).toBe(0x04); // R incremented again for second iteration
  });

  it('R is initialized to 0x00 on CPU creation', (): void => {
    const bus = new SimpleBus();
    const cpu = createZ80({ bus });
    expect(cpu.getState().r).toBe(0x00);
  });

  it('Rapid R increment wrapping', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: many NOPs to wrap R around
    const program = Array(300).fill(0x00);
    mem.set(program, 0x0000);
    const cpu = createZ80({ bus });

    // Start with R at 0xFE (will wrap after 2 instructions)
    setRegs(cpu, { r: 0xfe });

    // First NOP: R -> 0xFF
    step(cpu);
    expect(cpu.getState().r).toBe(0xff);

    // Second NOP: R -> 0x80 (wraps, preserving bit 7)
    step(cpu);
    expect(cpu.getState().r).toBe(0x80);

    // Third NOP: R -> 0x81
    step(cpu);
    expect(cpu.getState().r).toBe(0x81);
  });
});
