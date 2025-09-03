import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

// ADC/SBC A instruction coverage (register, immediate, and (HL))

describe('Z80 ADC/SBC A instructions', (): void => {
  it('ADC A,B without carry updates A, flags, cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x88], 0x0000); // ADC A,B
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x0f, b: 0x01, f: st.f & ~0x01 }); // C=0
    const c = step(cpu);
    expect(c).toBe(4);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x10);
    // Half-carry set (0x0F + 0x01)
    expect((f & 0x10) !== 0).toBe(true);
    // PV (overflow) clear
    expect((f & 0x04) === 0).toBe(true);
    // C clear
    expect((f & 0x01) === 0).toBe(true);
  });

  it('ADC A,n with carry produces signed overflow 0x7F + carry 1 -> 0x80', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xce, 0x00], 0x0010); // ADC A,0x00
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x7f, f: (st.f | 0x01) & 0xff, pc: 0x0010 }); // set C=1
    const c = step(cpu);
    expect(c).toBe(7);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x80);
    // PV set (signed overflow)
    expect((f & 0x04) !== 0).toBe(true);
    // H set (0x0F + 0 + 1)
    expect((f & 0x10) !== 0).toBe(true);
    // C clear
    expect((f & 0x01) === 0).toBe(true);
  });

  it('ADC A,(HL) 7 cycles reads from memory', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ADC A,(HL)
    mem.set([0x8e], 0x0020);
    mem[0x3000] = 0x01;
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x00, h: 0x30, l: 0x00, pc: 0x0020, f: st.f & ~0x01 });
    const c = step(cpu);
    expect(c).toBe(7);
    expect(cpu.getState().a).toBe(0x01);
  });

  it('SBC A,B with carry set computes 0 - 0 - 1 = 0xFF with flags', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x98], 0x0030); // SBC A,B
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x00, b: 0x00, f: (st.f | 0x01) & 0xff, pc: 0x0030 }); // C=1
    const c = step(cpu);
    expect(c).toBe(4);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0xff);
    // N set
    expect((f & 0x02) !== 0).toBe(true);
    // C set (borrow)
    expect((f & 0x01) !== 0).toBe(true);
    // H set (half borrow)
    expect((f & 0x10) !== 0).toBe(true);
    // PV clear (no overflow)
    expect((f & 0x04) === 0).toBe(true);
  });

  it('SBC A,n without carry: 0x80 - 0x01 = 0x7F, PV set, C clear, H set', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xde, 0x01], 0x0040); // SBC A,0x01
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x80, f: st.f & ~0x01, pc: 0x0040 });
    const c = step(cpu);
    expect(c).toBe(7);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x7f);
    // N set
    expect((f & 0x02) !== 0).toBe(true);
    // PV set (overflow)
    expect((f & 0x04) !== 0).toBe(true);
    // C clear
    expect((f & 0x01) === 0).toBe(true);
    // H set (half borrow from 0x00 - 1)
    expect((f & 0x10) !== 0).toBe(true);
  });

  it('SBC A,(HL) has 7 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x9e], 0x0050); // SBC A,(HL)
    mem[0x4000] = 0x01;
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x02, h: 0x40, l: 0x00, pc: 0x0050, f: st.f & ~0x01 }); // carry=0
    const c = step(cpu);
    expect(c).toBe(7);
    expect(cpu.getState().a).toBe(0x01);
  });
});
