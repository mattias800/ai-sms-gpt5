import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 timing alignment (selected instructions)', (): void => {
  it('JP cc,nn is 10 cycles whether taken or not', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JP NZ,0x1234; HALT
    mem.set([0xc2, 0x34, 0x12, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // Not taken when Z=1
    let st = cpu.getState();
    cpu.setState({ ...st, f: 0x40 }); // Z
    let c = step(cpu);
    expect(c).toBe(10);
    // Taken when Z=0
    mem.set([0xc2, 0x34, 0x12, 0x76], 0x0000);
    st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0000, f: 0x00 });
    c = step(cpu);
    expect(c).toBe(10);
  });

  it('CALL cc,nn is 17 cycles if taken, 10 if not', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // CALL C,0x2000; HALT
    mem.set([0xdc, 0x00, 0x20, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // Not taken when C=0
    let st = cpu.getState();
    cpu.setState({ ...st, f: 0x00 });
    let c = step(cpu);
    expect(c).toBe(10);
    // Taken when C=1
    mem.set([0xdc, 0x00, 0x20, 0x76], 0x0000);
    st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0000, f: 0x01 });
    c = step(cpu);
    expect(c).toBe(17);
  });

  it('RET cc is 11 cycles if taken, 5 if not', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // RET NZ; HALT
    mem.set([0xc0, 0x76], 0x1000);
    const cpu = createZ80({ bus });
    let st = cpu.getState();
    // Prepare stack with return address 0x1234
    st = cpu.getState();
    cpu.setState({ ...st, pc: 0x1000, sp: 0x9000 });
    mem[0x9000] = 0x34;
    mem[0x9001] = 0x12;
    // Taken when Z=0
    cpu.setState({ ...cpu.getState(), f: 0x00 });
    let c = step(cpu);
    expect(c).toBe(11);
    // Not taken when Z=1
    cpu.setState({ ...cpu.getState(), pc: 0x1000, f: 0x40 });
    c = step(cpu);
    expect(c).toBe(5);
  });

  it('CB RLC r is 8 cycles; RLC (HL) is 15 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    const cpu = createZ80({ bus });
    // RLC B
    mem.set([0xcb, 0x00], 0x0000);
    let c = step(cpu);
    expect(c).toBe(8);
    // Set HL and memory value; RLC (HL)
    const st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0100, h: 0x20, l: 0x00 });
    mem[0x0100] = 0xcb;
    mem[0x0101] = 0x06; // CB 06 => RLC (HL)
    c = step(cpu);
    expect(c).toBe(15);
  });

  it('CB BIT 3,B is 8 cycles; BIT 3,(HL) is 12 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    const cpu = createZ80({ bus });
    // BIT 3,B => CB 58
    mem.set([0xcb, 0x58], 0x0000);
    let c = step(cpu);
    expect(c).toBe(8);
    // BIT 3,(HL) => CB 5E
    const st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0100, h: 0x40, l: 0x00 });
    mem[0x0100] = 0xcb;
    mem[0x0101] = 0x5e;
    c = step(cpu);
    expect(c).toBe(12);
  });

  it('EX (SP),HL takes 19 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // EX (SP),HL
    mem.set([0xe3], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, sp: 0x8000, h: 0x12, l: 0x34 });
    mem[0x8000] = 0x78;
    mem[0x8001] = 0x56;
    const c = step(cpu);
    expect(c).toBe(19);
  });

  it('LD (nn),A and LD A,(nn) each take 13 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (0x4000),A ; HALT
    mem.set([0x32, 0x00, 0x40, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    let st = cpu.getState();
    cpu.setState({ ...st, a: 0x99 });
    let c = step(cpu);
    expect(c).toBe(13);
    expect(mem[0x4000]).toBe(0x99);

    // LD A,(0x4002) ; HALT
    mem.set([0x3a, 0x02, 0x40, 0x76], 0x0000);
    mem[0x4002] = 0xaa;
    st = cpu.getState();
    cpu.setState({ ...st, pc: 0x0000, a: 0x00 });
    c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().a).toBe(0xaa);
  });

  it('INC r is 4 cycles; INC (HL) is 11 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = new SimpleBus().getMemory(); // unused
    void mem;
    const cpu = createZ80({ bus });
    // INC B
    const c1 = cpu.stepOne().cycles; // default memory at 0x0000 is 0x00; NOP? make sure we set proper op
    // Instead, set program to INC B (0x04)
    const m = (bus as SimpleBus).getMemory();
    m[0x0000] = 0x04;
    let c = step(cpu);
    expect(c).toBe(4);
    // INC (HL)
    const st = cpu.getState();
    (bus as SimpleBus).getMemory()[0x0100] = 0x34; // value at (HL)
    (bus as SimpleBus).getMemory()[0x0001] = 0x76; // HALT after
    cpu.setState({ ...st, pc: 0x0101, h: 0x01, l: 0x00 });
    (bus as SimpleBus).getMemory()[0x0101] = 0x34; // placeholder; will be overwritten below
    (bus as SimpleBus).getMemory()[0x0101] = 0x34;
    (bus as SimpleBus).getMemory()[0x0101] = 0x34;
    // Actually set opcode at pc to INC (HL) (0x34)
    (bus as SimpleBus).getMemory()[0x0101] = 0x34;
    c = step(cpu);
    expect(c).toBe(11);
  });
});
