import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IX/IY stack and (nn) transfers: PUSH/POP IX/IY, LD (nn),IX/IY and LD IX/IY,(nn)', (): void => {
  it('PUSH IX (DD E5) then POP IY (FD E1)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // DD E5 (PUSH IX), FD E1 (POP IY)
    mem.set([0xdd, 0xe5, 0xfd, 0xe1], 0x0000);
    const cpu = createZ80({ bus });
    // Seed IX and SP
    const st0 = cpu.getState();
    cpu.setState({ ...st0, ix: 0xabcd, sp: 0x4000, iy: 0x0000 });

    // PUSH IX
    let c = step(cpu);
    expect(c).toBe(15);
    let st = cpu.getState();
    expect(st.sp).toBe(0x3ffe);
    expect(bus.getMemory()[0x3ffe]).toBe(0xcd); // low byte at SP
    expect(bus.getMemory()[0x3fff]).toBe(0xab); // high byte at SP+1

    // POP IY
    c = step(cpu);
    expect(c).toBe(14);
    st = cpu.getState();
    expect(st.sp).toBe(0x4000);
    expect(st.iy).toBe(0xabcd);
  });

  it('LD (nn),IX (DD 22) and LD IX,(nn) (DD 2A)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // DD 22 00 90 (LD (0x9000),IX)
    // DD 2A 02 90 (LD IX,(0x9002))
    mem.set([0xdd, 0x22, 0x00, 0x90, 0xdd, 0x2a, 0x02, 0x90], 0x0000);
    const cpu = createZ80({ bus });
    // Seed IX and memory
    let st = cpu.getState();
    cpu.setState({ ...st, ix: 0x2468 });
    // Prepare memory at 0x9002
    mem[0x9002] = 0x34; // low
    mem[0x9003] = 0x12; // high

    // LD (nn),IX
    let c = step(cpu);
    expect(c).toBe(20);
    expect(mem[0x9000]).toBe(0x68);
    expect(mem[0x9001]).toBe(0x24);

    // LD IX,(nn)
    c = step(cpu);
    expect(c).toBe(20);
    st = cpu.getState();
    expect(st.ix).toBe(0x1234);
  });

  it('LD (nn),IY (FD 22) and LD IY,(nn) (FD 2A)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // FD 22 10 A0 (LD (0xA010),IY)
    // FD 2A 12 A0 (LD IY,(0xA012))
    mem.set([0xfd, 0x22, 0x10, 0xa0, 0xfd, 0x2a, 0x12, 0xa0], 0x0000);
    const cpu = createZ80({ bus });
    // Seed IY and memory
    let st = cpu.getState();
    cpu.setState({ ...st, iy: 0x9abc });
    // Memory at 0xA012
    mem[0xa012] = 0xef; // low
    mem[0xa013] = 0xbe; // high

    // LD (nn),IY
    let c = step(cpu);
    expect(c).toBe(20);
    expect(mem[0xa010]).toBe(0xbc);
    expect(mem[0xa011]).toBe(0x9a);

    // LD IY,(nn)
    c = step(cpu);
    expect(c).toBe(20);
    st = cpu.getState();
    expect(st.iy).toBe(0xbeef);
  });
});
