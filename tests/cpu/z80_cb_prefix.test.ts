import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type IZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_H, FLAG_N, FLAG_S, FLAG_Z } from '../../src/cpu/z80/flags.js';

const step = (cpu: IZ80): number => cpu.stepOne().cycles;

describe('Z80 CB-prefixed (rotates/shifts, BIT, RES, SET)', (): void => {
  it('RLC r and RLC (HL) set flags and cycles correctly', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD B,0x81; RLC B (CB 00); LD H,0x40; LD L,0x10; RLC (HL); HALT
    mem.set(
      [
        0x06,
        0x81, // LD B,0x81
        0xcb,
        0x00, // RLC B -> 0x03, C=1
        0x26,
        0x40, // LD H,0x40
        0x2e,
        0x10, // LD L,0x10
        0xcb,
        0x06, // RLC (HL) -> 0x01, C=1 (given mem[0x4010]=0x80)
        0x76, // HALT
      ],
      0x0000
    );
    // Preload memory at HL target
    mem[0x4010] = 0x80;
    const cpu = createZ80({ bus });

    // LD B
    expect(step(cpu)).toBe(7);
    // RLC B
    expect(step(cpu)).toBe(8);
    let st = cpu.getState();
    expect(st.b).toBe(0x03);
    expect((st.f & FLAG_C) !== 0).toBe(true);
    expect((st.f & FLAG_N) !== 0).toBe(false);
    expect((st.f & FLAG_H) !== 0).toBe(false);

    // Set HL and memory
    expect(step(cpu)).toBe(7);
    expect(step(cpu)).toBe(7);
    // Execute RLC (HL)
    const res = cpu.stepOne();
    expect(res.cycles).toBe(15);
    st = cpu.getState();
    expect(bus.getMemory()[0x4010]).toBe(0x01);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('BIT b,r and BIT b,(HL) set flags, preserve C, and have correct cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x80; SCF via setting F manually; BIT 7,A; LD H,0x40; LD L,0x20; LD (HL),0x00; BIT 2,(HL); HALT
    mem.set(
      [
        0x3e,
        0x80, // LD A,0x80
        0xcb,
        0x7f, // BIT 7,A
        0x26,
        0x40, // LD H,0x40
        0x2e,
        0x20, // LD L,0x20
        0x36,
        0x00, // LD (HL),0x00
        0xcb,
        0x56, // BIT 2,(HL) 0x40 + (2<<3) + 6
        0x76, // HALT
      ],
      0x0000
    );
    const cpu = createZ80({ bus });

    // LD A
    step(cpu);
    // Set C in flags via state (since SCF not implemented)
    const st0 = cpu.getState();
    cpu.setState({ ...st0, f: st0.f | FLAG_C });

    // BIT 7,A
    expect(step(cpu)).toBe(8);
    let st = cpu.getState();
    expect((st.f & FLAG_Z) !== 0).toBe(false);
    expect((st.f & FLAG_S) !== 0).toBe(true);
    expect((st.f & FLAG_H) !== 0).toBe(true);
    expect((st.f & FLAG_N) !== 0).toBe(false);
    expect((st.f & FLAG_C) !== 0).toBe(true); // preserved

    // Set HL and memory
    step(cpu);
    step(cpu);
    step(cpu); // write (HL)

    // BIT 2,(HL) should set Z=1 and take 12 cycles
    const res = cpu.stepOne();
    expect(res.cycles).toBe(12);
    st = cpu.getState();
    expect((st.f & FLAG_Z) !== 0).toBe(true);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('RES and SET for register and (HL) variants', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0xFF; RES 0,A; LD H,0x40; LD L,0x30; LD (HL),0x00; SET 7,(HL); HALT
    mem.set(
      [
        0x3e,
        0xff, // LD A,0xFF
        0xcb,
        0x87, // RES 0,A (0x80 + (0<<3) + 7)
        0x26,
        0x40, // LD H,0x40
        0x2e,
        0x30, // LD L,0x30
        0x36,
        0x00, // LD (HL),0x00
        0xcb,
        0xfe, // SET 7,(HL) (0xC0 + (7<<3) + 6) => 0xFE
        0x76, // HALT
      ],
      0x0000
    );
    const cpu = createZ80({ bus });
    step(cpu); // LD A
    const res1 = cpu.stepOne(); // RES 0,A
    expect(res1.cycles).toBe(8);
    const st = cpu.getState();
    expect(st.a).toBe(0xfe);
    // HL setup + store
    step(cpu);
    step(cpu);
    step(cpu);
    const res2 = cpu.stepOne(); // SET 7,(HL)
    expect(res2.cycles).toBe(15);
    expect(mem[0x4030]).toBe(0x80);
  });

  it('RL and SRL affect carry and SZPV flags correctly', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x80; RL A; LD D,0x01; SRL D; HALT
    mem.set([0x3e, 0x80, 0xcb, 0x17, 0x16, 0x01, 0xcb, 0x3a, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Set C before RL via state
    let st = cpu.getState();
    cpu.setState({ ...st, f: st.f | FLAG_C });

    step(cpu); // LD A
    expect(step(cpu)).toBe(8); // RL A
    st = cpu.getState();
    expect(st.a).toBe(0x01);
    expect((st.f & FLAG_C) !== 0).toBe(true);
    expect((st.f & FLAG_H) !== 0).toBe(false);
    expect((st.f & FLAG_N) !== 0).toBe(false);

    // LD D
    step(cpu);
    // SRL D
    expect(step(cpu)).toBe(8);
    st = cpu.getState();
    expect(st.d).toBe(0x00);
    expect((st.f & FLAG_C) !== 0).toBe(true);
    expect((st.f & FLAG_Z) !== 0).toBe(true);
  });
});
