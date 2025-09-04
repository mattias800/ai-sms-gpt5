import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_S, FLAG_Z } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 conditional JR/RET/CALL/JP paths', (): void => {
  it('JR NZ,d taken and not taken', (): void => {
    const bus1 = new SimpleBus();
    // JR NZ,+2
    bus1.getMemory().set([0x20, 0x02], 0x0000);
    const cpu1 = createZ80({ bus: bus1 });
    // Z=0 => taken
    let s = cpu1.getState();
    cpu1.setState({ ...s, f: s.f & ~FLAG_Z });
    let c = step(cpu1);
    expect(c).toBe(12);
    expect(cpu1.getState().pc).toBe(0x0004);

    const bus2 = new SimpleBus();
    bus2.getMemory().set([0x20, 0x02], 0x0000);
    const cpu2 = createZ80({ bus: bus2 });
    // Z=1 => not taken
    s = cpu2.getState();
    cpu2.setState({ ...s, f: s.f | FLAG_Z });
    c = step(cpu2);
    expect(c).toBe(7);
    expect(cpu2.getState().pc).toBe(0x0002);
  });

  it('RET Z taken and not taken', (): void => {
    const bus = new SimpleBus();
    bus.getMemory().set([0xc8], 0x0000); // RET Z
    const cpu = createZ80({ bus });
    // Prepare stack with return address 0x1234
    const s = cpu.getState();
    const mem = bus.getMemory();
    mem[0x8000] = 0x34;
    mem[0x8001] = 0x12;
    cpu.setState({ ...s, sp: 0x8000, f: (s.f | FLAG_Z) & 0xff });
    let c = step(cpu);
    expect(c).toBe(11);
    expect(cpu.getState().pc).toBe(0x1234);

    // Not taken path
    cpu.reset();
    const s2 = cpu.getState();
    bus.getMemory().set([0xc8], 0x0000);
    cpu.setState({ ...s2, sp: 0x8000, f: s2.f & ~FLAG_Z });
    c = step(cpu);
    expect(c).toBe(5);
    expect(cpu.getState().pc).toBe(0x0001);
  });

  it('CALL C,nn taken and not taken', (): void => {
    const bus = new SimpleBus();
    bus.getMemory().set([0xdc, 0x00, 0x40], 0x0000); // CALL C,0x4000
    const cpu = createZ80({ bus });
    // Taken when C=1
    const s = cpu.getState();
    cpu.setState({ ...s, f: s.f | FLAG_C, sp: 0x9000 });
    let c = step(cpu);
    expect(c).toBe(17);
    const st = cpu.getState();
    expect(st.pc).toBe(0x4000);
    // Return address pushed at 0x8ffe/0x8fff
    expect(bus.getMemory()[0x8fff]).toBe(0x00);
    expect(bus.getMemory()[0x8ffe]).toBe(0x03);

    // Not taken when C=0
    cpu.reset();
    const bus2 = new SimpleBus();
    bus2.getMemory().set([0xdc, 0x00, 0x40], 0x0000);
    const cpu2 = createZ80({ bus: bus2 });
    c = step(cpu2);
    expect(c).toBe(10);
    expect(cpu2.getState().pc).toBe(0x0003);
  });

  it('JP P,nn taken and not taken', (): void => {
    const bus = new SimpleBus();
    bus.getMemory().set([0xf2, 0x34, 0x12], 0x0000); // JP P,0x1234
    const cpu = createZ80({ bus });
    // P (S=0) => taken
    const s = cpu.getState();
    cpu.setState({ ...s, f: s.f & ~FLAG_S });
    let c = step(cpu);
    expect(c).toBe(10);
    expect(cpu.getState().pc).toBe(0x1234);

    // Not taken when S=1 (M)
    cpu.reset();
    bus.getMemory().set([0xf2, 0x34, 0x12], 0x0000);
    const s2 = cpu.getState();
    cpu.setState({ ...s2, f: s2.f | FLAG_S });
    c = step(cpu);
    expect(c).toBe(10);
    // pc advanced by 3 (not taken)
    expect(cpu.getState().pc).toBe(0x0003);
  });

  it('JP PO/PE and JP M cover remaining cc cases (both outcomes)', (): void => {
    // JP PO,0x2000 (parity odd => PV=0)
    const bus1 = new SimpleBus();
    bus1.getMemory().set([0xe2, 0x00, 0x20], 0x0000);
    const cpu1 = createZ80({ bus: bus1 });
    let s = cpu1.getState();
    cpu1.setState({ ...s, f: s.f & ~0x04 }); // clear PV
    let c = step(cpu1);
    expect(c).toBe(10);
    expect(cpu1.getState().pc).toBe(0x2000);

    // Not taken when PV=1
    const bus2 = new SimpleBus();
    bus2.getMemory().set([0xe2, 0x00, 0x20], 0x0000);
    const cpu2 = createZ80({ bus: bus2 });
    s = cpu2.getState();
    cpu2.setState({ ...s, f: s.f | 0x04 });
    c = step(cpu2);
    expect(c).toBe(10);
    expect(cpu2.getState().pc).toBe(0x0003);

    // JP PE,0x3000 (parity even => PV=1)
    const bus3 = new SimpleBus();
    bus3.getMemory().set([0xea, 0x00, 0x30], 0x0000);
    const cpu3 = createZ80({ bus: bus3 });
    s = cpu3.getState();
    cpu3.setState({ ...s, f: s.f | 0x04 });
    c = step(cpu3);
    expect(c).toBe(10);
    expect(cpu3.getState().pc).toBe(0x3000);

    // Not taken when PV=0
    const bus4 = new SimpleBus();
    bus4.getMemory().set([0xea, 0x00, 0x30], 0x0000);
    const cpu4 = createZ80({ bus: bus4 });
    s = cpu4.getState();
    cpu4.setState({ ...s, f: s.f & ~0x04 });
    c = step(cpu4);
    expect(c).toBe(10);
    expect(cpu4.getState().pc).toBe(0x0003);

    // JP M,0x4000 (sign negative => S=1)
    const bus5 = new SimpleBus();
    bus5.getMemory().set([0xfa, 0x00, 0x40], 0x0000);
    const cpu5 = createZ80({ bus: bus5 });
    s = cpu5.getState();
    cpu5.setState({ ...s, f: s.f | 0x80 });
    c = step(cpu5);
    expect(c).toBe(10);
    expect(cpu5.getState().pc).toBe(0x4000);

    // Not taken when S=0
    const bus6 = new SimpleBus();
    bus6.getMemory().set([0xfa, 0x00, 0x40], 0x0000);
    const cpu6 = createZ80({ bus: bus6 });
    s = cpu6.getState();
    cpu6.setState({ ...s, f: s.f & ~0x80 });
    c = step(cpu6);
    expect(c).toBe(10);
    expect(cpu6.getState().pc).toBe(0x0003);
  });
});
