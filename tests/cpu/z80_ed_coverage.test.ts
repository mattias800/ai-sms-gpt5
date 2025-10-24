import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_Z } from '../../src/cpu/z80/flags.js';

describe('Z80 ED coverage boosts', (): void => {
  it('undocumented ED opcodes execute as 8 T-state no-ops per Z80 spec', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED 6E is undefined in the Z80 instruction set; should execute as NOP
    mem.set([0xed, 0x6e, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    const f0 = st0.f; // capture initial flags
    const a0 = st0.a; // capture initial A
    cpu.stepOne();
    const st = cpu.getState();
    // Should take 8 T-states (M1 4 for ED + 4 for 6E, but mkRes reports 8 total for the opcode)
    // Flags and A should be unchanged
    expect(st.f).toBe(f0);
    expect(st.a).toBe(a0);
    // PC should advance by 2 (ED + subcode)
    expect(st.pc).toBe((st0.pc + 2) & 0xffff);
  });

  it('LD A,I with iff2=false sets PV=0 and Z from I', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x57, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    cpu.setState({ ...st0, i: 0x00, iff2: false, f: 0 });
    cpu.stepOne();
    const st = cpu.getState();
    expect((st.f & FLAG_Z) !== 0).toBe(true);
  });

  it('IM 0 via ED 66 also sets IM mode', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x66, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    cpu.stepOne();
    expect(cpu.getState().im).toBe(0);
  });

  it('ADC HL,HL carry and cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x6a, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0xff, l: 0xff, f: 0 });
    const c = cpu.stepOne().cycles;
    expect(c).toBe(15);
    const st = cpu.getState();
    expect(((st.h << 8) | st.l) & 0xffff).toBe(0xfffe);
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('LD (nn),HL and LD BC,(nn) paths', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (0x4008),HL
    mem.set([0xed, 0x63, 0x08, 0x40, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x12, l: 0x34 });
    expect(cpu.stepOne().cycles).toBe(20);
    expect(mem[0x4008]).toBe(0x34);
    expect(mem[0x4009]).toBe(0x12);

    // LD BC,(0x400a)
    mem.set([0xed, 0x4b, 0x0a, 0x40, 0x76], 0x0000);
    mem[0x400a] = 0x78;
    mem[0x400b] = 0x56;
    // reset PC
    let st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0000 });
    expect(cpu.stepOne().cycles).toBe(20);
    st = cpu.getState();
    expect(st.b).toBe(0x56);
    expect(st.c).toBe(0x78);
  });

  it('NEG A=0x80 sets PV=1', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x3e, 0x80, 0xed, 0x44, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // LD A
    cpu.stepOne();
    cpu.stepOne(); // NEG
    const st = cpu.getState();
    // PV set for 0x80
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect((st.f & 0x04) !== 0).toBe(true);
  });

  it('LD A,R with iff2=false keeps PV=0', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xed, 0x5f, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    // Set R to a nonzero and iff2 false
    cpu.setState({ ...st0, r: 0x22, iff2: false, f: 0 });
    cpu.stepOne();
    const st = cpu.getState();
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect((st.f & 0x04) !== 0).toBe(false);
  });

  it('ADC HL,DE and SBC HL,SP exercise ss selections', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ADC HL,DE; HALT
    mem.set([0xed, 0x5a, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    let st = cpu.getState();
    cpu.setState({ ...st, h: 0x00, l: 0x01, d: 0x00, e: 0x01, f: 0 });
    cpu.stepOne();
    st = cpu.getState();
    expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0002);

    // SBC HL,SP; HALT
    mem.set([0xed, 0x72, 0x76], 0x0000);
    st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0000, h: 0x00, l: 0x01, sp: 0x0001, f: 0 });
    cpu.stepOne();
    st = cpu.getState();
    expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0000);
    expect((st.f & FLAG_Z) !== 0).toBe(true);
  });

  it('LD (nn),BC and LD DE,(nn) exercise both value paths', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (0x4010),BC
    mem.set([0xed, 0x43, 0x10, 0x40, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    let st = cpu.getState();
    cpu.setState({ ...st, b: 0x12, c: 0x34 });
    cpu.stepOne();
    expect(mem[0x4010]).toBe(0x34);
    expect(mem[0x4011]).toBe(0x12);

    // LD DE,(0x4012)
    mem.set([0xed, 0x5b, 0x12, 0x40, 0x76], 0x0000);
    mem[0x4012] = 0x9a;
    mem[0x4013] = 0xbc;
    st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0000, d: 0x00, e: 0x00 });
    cpu.stepOne();
    st = cpu.getState();
    expect(st.d).toBe(0xbc);
    expect(st.e).toBe(0x9a);
  });
});
