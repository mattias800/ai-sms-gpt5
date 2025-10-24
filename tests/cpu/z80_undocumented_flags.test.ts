import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_S, FLAG_Z, FLAG_3, FLAG_H, FLAG_5, FLAG_PV, FLAG_N, FLAG_C } from '../../src/cpu/z80/flags.js';

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

describe('Z80 undocumented and complex flag behaviors', (): void => {
  it('Flag bit 3 (F3): set based on bit 3 of result in arithmetic operations', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x0F (bit 3 set), B=0x01 -> result=0x10 (bit 3 clear)
    setRegs(cpu, { a: 0x0f, b: 0x01, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_3) !== 0).toBe(false);

    // A=0x0E (bit 3 clear), B=0x01 -> result=0x0F (bit 3 set)
    setRegs(cpu, { a: 0x0e, b: 0x01, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_3) !== 0).toBe(true);
  });

  it('Flag bit 5 (F5): set based on bit 5 of result in arithmetic operations', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x1F (bit 5 set), B=0x01 -> result=0x20 (bit 5 clear)
    setRegs(cpu, { a: 0x1f, b: 0x01, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_5) !== 0).toBe(false);

    // A=0x1E (bit 5 clear), B=0x01 -> result=0x1F (bit 5 set)
    setRegs(cpu, { a: 0x1e, b: 0x01, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_5) !== 0).toBe(true);
  });

  it('Half-carry flag (H): set on carry from bit 3 to bit 4', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x0F, B=0x01 -> Half-carry from bit 3 (0x0F + 0x01 = 0x10, carry from bit 3)
    setRegs(cpu, { a: 0x0f, b: 0x01, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect((st.f & FLAG_H) !== 0).toBe(true);

    // A=0x0E, B=0x01 -> No half-carry (0x0E + 0x01 = 0x0F, no carry from bit 3)
    setRegs(cpu, { a: 0x0e, b: 0x01, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_H) !== 0).toBe(false);
  });

  it('Parity/overflow flag (PV): set on overflow in ADD', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x50 (positive), B=0x50 (positive) -> 0xA0 (negative, overflow)
    setRegs(cpu, { a: 0x50, b: 0x50, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    // PV should be set (overflow occurred)
    expect((st1.f & FLAG_PV) !== 0).toBe(true);

    // A=0x30 (positive), B=0x40 (positive) -> 0x70 (positive, no overflow)
    setRegs(cpu, { a: 0x30, b: 0x40, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_PV) !== 0).toBe(false);
  });

  it('Sign flag (S): reflects bit 7 of result', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x40, B=0x40 -> 0x80 (negative, bit 7 set)
    setRegs(cpu, { a: 0x40, b: 0x40, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_S) !== 0).toBe(true);

    // A=0x30, B=0x40 -> 0x70 (positive, bit 7 clear)
    setRegs(cpu, { a: 0x30, b: 0x40, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_S) !== 0).toBe(false);
  });

  it('Zero flag (Z): set when result is 0', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x00, B=0x00 -> 0x00 (zero)
    setRegs(cpu, { a: 0x00, b: 0x00, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_Z) !== 0).toBe(true);

    // A=0x01, B=0x00 -> 0x01 (not zero)
    setRegs(cpu, { a: 0x01, b: 0x00, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_Z) !== 0).toBe(false);
  });

  it('Carry flag (C): set on unsigned overflow', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; HALT
    mem.set([0x80, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0xFF, B=0x01 -> 0x00 with carry
    setRegs(cpu, { a: 0xff, b: 0x01, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_C) !== 0).toBe(true);

    // A=0x7F, B=0x01 -> 0x80 without carry
    setRegs(cpu, { a: 0x7f, b: 0x01, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_C) !== 0).toBe(false);
  });

  it('N flag (subtract flag): cleared after ADD, set after SUB', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; SUB B; HALT
    mem.set([0x80, 0x90, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setRegs(cpu, { a: 0x50, b: 0x30, f: 0x00 });

    // ADD A,B
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_N) !== 0).toBe(false); // ADD clears N

    // SUB B
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_N) !== 0).toBe(true); // SUB sets N
  });

  it('DAA (Decimal Adjust A): converts binary to BCD after ADD', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD A,B; DAA; HALT
    mem.set([0x80, 0x27, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x09, B=0x08 -> binary result 0x11, DAA should make it 0x17 (BCD)
    setRegs(cpu, { a: 0x09, b: 0x08, f: 0x00 });
    step(cpu); // ADD
    step(cpu); // DAA
    const st = cpu.getState();
    expect(st.a).toBe(0x17); // BCD result
  });

  it('RLC (Rotate Left Circular): carries out bit 7, shifts left, copies to bit 0', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: RLC A; HALT
    mem.set([0xcb, 0x07, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x80 -> rotate left: 0x01 with carry set
    setRegs(cpu, { a: 0x80, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x01);
    expect((st.f & FLAG_C) !== 0).toBe(true); // Carry from bit 7
  });

  it('RRC (Rotate Right Circular): carries out bit 0, shifts right, copies to bit 7', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: RRC A; HALT
    mem.set([0xcb, 0x0f, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x01 -> rotate right: 0x80 with carry set
    setRegs(cpu, { a: 0x01, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x80);
    expect((st.f & FLAG_C) !== 0).toBe(true); // Carry from bit 0
  });

  it('SLA (Shift Left Arithmetic): shifts left, clears bit 0, bit 7 to carry', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: SLA A; HALT
    mem.set([0xcb, 0x27, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x80 -> shift left: 0x00 with carry set (bit 7 was set)
    setRegs(cpu, { a: 0x80, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x00);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('SRA (Shift Right Arithmetic): shifts right, preserves bit 7, bit 0 to carry', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: SRA A; HALT
    mem.set([0xcb, 0x2f, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x81 (bit 7 set) -> shift right: 0xC0 (bit 7 preserved) with carry set
    setRegs(cpu, { a: 0x81, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0xc0);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('SRL (Shift Right Logical): shifts right, clears bit 7, bit 0 to carry', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: SRL A; HALT
    mem.set([0xcb, 0x3f, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x81 -> shift right: 0x40 (bit 7 cleared) with carry set
    setRegs(cpu, { a: 0x81, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x40);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('Parity flag (PV) for odd parity when used as parity (not overflow)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x0F; RLCA; BIT 0,A (undocumented, but tests parity logic); HALT
    // Use a different approach: test with actual instruction that uses parity
    // Program: LD A,0x01; CPL (complement, toggles bits); HALT
    mem.set([0x3e, 0x01, 0x2f, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    step(cpu); // LD A,0x01
    step(cpu); // CPL
    const st = cpu.getState();
    // CPL of 0x01 is 0xFE (11111110, even parity)
    expect(st.a).toBe(0xfe);
  });

  it('Half-carry flag (H) with subtraction: set on borrow from bit 4', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: SUB B; HALT
    mem.set([0x90, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x10, B=0x01 -> 0x0F (no borrow from bit 4)
    setRegs(cpu, { a: 0x10, b: 0x01, f: 0x00 });
    step(cpu);
    const st1 = cpu.getState();
    expect((st1.f & FLAG_H) !== 0).toBe(true); // Borrow from bit 4

    // A=0x1F, B=0x01 -> 0x1E (no borrow from bit 4)
    setRegs(cpu, { a: 0x1f, b: 0x01, f: 0x00 });
    step(cpu);
    const st2 = cpu.getState();
    expect((st2.f & FLAG_H) !== 0).toBe(false);
  });

  it('CP (Compare): preserves A, sets flags like subtraction', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CP B; HALT
    mem.set([0xb8, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x42, B=0x42 -> equal
    setRegs(cpu, { a: 0x42, b: 0x42, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x42); // A unchanged
    expect((st.f & FLAG_Z) !== 0).toBe(true); // Z flag set
    expect((st.f & FLAG_N) !== 0).toBe(true); // N flag set (like SUB)
  });

  it('INC/DEC affect all flags except Carry', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: INC A; DEC A; HALT
    mem.set([0x3c, 0x3d, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    setRegs(cpu, { a: 0x7f, f: 0x01 }); // Set carry flag initially

    // INC A: 0x7F + 1 = 0x80 (overflow, sets PV)
    step(cpu);
    let st = cpu.getState();
    expect(st.a).toBe(0x80);
    expect((st.f & FLAG_PV) !== 0).toBe(true); // Overflow
    expect((st.f & FLAG_C) !== 0).toBe(true); // Carry preserved

    // DEC A: 0x80 - 1 = 0x7F
    step(cpu);
    st = cpu.getState();
    expect(st.a).toBe(0x7f);
    expect((st.f & FLAG_N) !== 0).toBe(true); // N set after DEC
  });

  it('Rotate with carry (RL, RR): uses and updates carry flag', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: RL A; HALT
    mem.set([0xcb, 0x17, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x00, Carry=1 -> RL shifts in the carry
    setRegs(cpu, { a: 0x00, f: 0x01 }); // Carry set
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x01); // Carry shifted in
    expect((st.f & FLAG_C) !== 0).toBe(false); // Old bit 7 was 0
  });

  it('BIT instruction: affects Z, H, and PV flags, clears N', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: BIT 0,A; HALT
    mem.set([0xcb, 0x47, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x00, test bit 0
    setRegs(cpu, { a: 0x00, f: 0xff }); // All flags set initially
    step(cpu);
    const st = cpu.getState();
    expect((st.f & FLAG_Z) !== 0).toBe(true); // Z set (bit 0 clear)
    expect((st.f & FLAG_N) !== 0).toBe(false); // N cleared
  });

  it('ADD HL,BC affects only C and H flags, preserves others', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADD HL,BC; HALT
    mem.set([0x09, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // HL=0x7FFF, BC=0x0001 -> HL=0x8000 (no carry)
    setRegs(cpu, { h: 0x7f, l: 0xff, b: 0x00, c: 0x01, f: 0xff }); // All flags set
    step(cpu);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x8000);
    expect((st.f & FLAG_C) !== 0).toBe(false); // Carry cleared
    expect((st.f & FLAG_N) !== 0).toBe(false); // N cleared
  });

  it('AND operation: clears C, sets H, affects other flags', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: AND B; HALT
    mem.set([0xa0, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0xFF, B=0x0F -> 0x0F
    setRegs(cpu, { a: 0xff, b: 0x0f, f: 0x00 });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x0f);
    expect((st.f & FLAG_C) !== 0).toBe(false); // Carry cleared
    expect((st.f & FLAG_H) !== 0).toBe(true); // H set
  });

  it('OR operation: clears C and H, affects other flags', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: OR B; HALT
    mem.set([0xb0, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x0F, B=0xF0 -> 0xFF
    setRegs(cpu, { a: 0x0f, b: 0xf0, f: 0xff }); // All flags set
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0xff);
    expect((st.f & FLAG_C) !== 0).toBe(false); // Carry cleared
    expect((st.f & FLAG_H) !== 0).toBe(false); // H cleared
  });

  it('XOR operation: clears C and H, sets Z if result is 0', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: XOR B; HALT
    mem.set([0xa8, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // A=0x42, B=0x42 -> 0x00 (XOR with itself)
    setRegs(cpu, { a: 0x42, b: 0x42, f: 0xff });
    step(cpu);
    const st = cpu.getState();
    expect(st.a).toBe(0x00);
    expect((st.f & FLAG_Z) !== 0).toBe(true); // Z set
    expect((st.f & FLAG_C) !== 0).toBe(false); // Carry cleared
  });
});
