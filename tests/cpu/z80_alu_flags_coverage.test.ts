import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

// Exercise ALU flag branches for ADD/SUB/AND/XOR/OR/CP and INC/DEC edge cases

describe('Z80 ALU flags coverage', (): void => {
  it('INC A at 0x7F sets PV on overflow to 0x80 and preserves C', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x3c], 0x0000); // INC A
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    // A=0x7F, set C=1 beforehand to check preserve
    cpu.setState({ ...st, a: 0x7f, f: (st.f | 0x01) & 0xff });
    const c = step(cpu);
    expect(c).toBe(4);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x80);
    expect((f & 0x04) !== 0).toBe(true); // PV set
    expect((f & 0x01) !== 0).toBe(true); // C preserved
  });

  it('DEC A at 0x80 sets PV on overflow to 0x7F and preserves C', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x3d], 0x0000); // DEC A
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x80, f: (st.f | 0x01) & 0xff });
    const c = step(cpu);
    expect(c).toBe(4);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x7f);
    expect((f & 0x04) !== 0).toBe(true); // PV set
    expect((f & 0x01) !== 0).toBe(true); // C preserved
  });

  it('ADD A,n sets H and PV appropriately on 0x7F + 0x01', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xc6, 0x01], 0x0000); // ADD A,0x01
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x7f });
    const c = step(cpu);
    expect(c).toBe(7);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x80);
    expect((f & 0x10) !== 0).toBe(true); // H set
    expect((f & 0x04) !== 0).toBe(true); // PV set
    expect((f & 0x01) === 0).toBe(true); // C clear
  });

  it('SUB n sets half-borrow and result flags on 0x10 - 0x01; CP n sets flags without changing A', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // SUB 0x01; CP 0x01
    mem.set([0xd6, 0x01, 0xfe, 0x01], 0x0100);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x10, pc: 0x0100 });
    let c = step(cpu);
    expect(c).toBe(7);
    const f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x0f);
    expect((f & 0x10) !== 0).toBe(true); // H set (half borrow)
    expect((f & 0x01) === 0).toBe(true); // C clear

    c = step(cpu); // CP 0x01
    expect(c).toBe(7);
    // A unchanged by CP
    expect(cpu.getState().a).toBe(0x0f);
  });

  it('AND/XOR/OR n set PV as parity of result and H for AND', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // AND 0x0F; XOR 0x01; OR 0x02
    mem.set([0xe6, 0x0f, 0xee, 0x01, 0xf6, 0x02], 0x0200);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0xf0, pc: 0x0200 });
    // AND -> 0x00, H set, PV set
    let c = step(cpu);
    expect(c).toBe(7);
    let f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x00);
    expect((f & 0x10) !== 0).toBe(true); // H set
    expect((f & 0x04) !== 0).toBe(true); // PV set (parity of 0)

    // XOR 0x01 => 0x01, PV cleared (odd parity)
    c = step(cpu);
    expect(c).toBe(7);
    f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x01);
    expect((f & 0x04) === 0).toBe(true);

    // OR 0x02 => 0x03 (two bits) PV set (even parity)
    c = step(cpu);
    expect(c).toBe(7);
    f = cpu.getState().f;
    expect(cpu.getState().a).toBe(0x03);
    expect((f & 0x04) !== 0).toBe(true);
  });
});
