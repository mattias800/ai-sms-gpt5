import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Flags and conditional branch coverage', (): void => {
  it('CCF toggles carry and sets H from previous C', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: CCF; SCF; CCF
    mem.set([0x3f, 0x37, 0x3f], 0x0000);
    const cpu = createZ80({ bus });

    // First CCF with C=0 -> sets C
    step(cpu);
    let f = cpu.getState().f;
    expect((f & 0x01) !== 0).toBe(true);
    expect((f & 0x10) === 0).toBe(true);

    // SCF sets C
    step(cpu);

    // Second CCF with C=1 -> clears C and sets H
    step(cpu);
    f = cpu.getState().f;
    expect((f & 0x01) === 0).toBe(true);
    expect((f & 0x10) !== 0).toBe(true);
  });

  it('RET NZ: takes pop when Z=0, otherwise falls through', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at 0000: RET NZ; RET NZ
    mem.set([0xc0, 0xc0], 0x0000);
    const cpu = createZ80({ bus });

    // Prepare stack with return address 0x1234
    const st = cpu.getState();
    cpu.setState({ ...st, sp: 0x8000 });
    mem[0x8000] = 0x34; // lo
    mem[0x8001] = 0x12; // hi

    // Z=0 -> RET NZ pops and jumps
    let c = step(cpu);
    expect(c).toBe(11);
    expect(cpu.getState().pc).toBe(0x1234);

    // Set PC back to 0001 to execute second RET NZ with Z=1
    const st2 = cpu.getState();
    cpu.setState({ ...st2, pc: 0x0001, f: (st2.f | 0x40) & 0xff }); // set Z

    c = step(cpu);
    expect(c).toBe(5);
    expect(cpu.getState().pc).toBe(0x0002);
  });
});
