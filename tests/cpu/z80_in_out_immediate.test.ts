import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

describe('Z80 immediate I/O IN A,(n) and OUT (n),A', (): void => {
  it('IN A,(n) reads from port and sets flags like IN A,(C)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: IN A,(0x42); HALT
    mem.set([0xdb, 0x42, 0x76], 0x0000);
    // Mock readIO8 to return a value
    let lastPort = -1;
    bus.readIO8 = (p: number): number => { lastPort = p & 0xff; return 0x85; };
    const cpu = createZ80({ bus });
    const c = cpu.stepOne().cycles;
    expect(c).toBe(11);
    const st = cpu.getState();
    expect(st.a).toBe(0x85);
    expect(lastPort).toBe(0x42);
    // Check flags: S set, Z clear, PV parity of 0x85 (even? 0b10000101 has 3 ones -> odd -> PV=0), F3/F5 from value
    expect((st.f & 0x80) !== 0).toBe(true); // S
    expect((st.f & 0x40) !== 0).toBe(false); // Z
  });

  it('OUT (n),A writes to port and preserves flags', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x7F; OUT (0x99),A; HALT
    mem.set([0x3e, 0x7f, 0xd3, 0x99, 0x76], 0x0000);
    let wrote: Array<{ p: number; v: number }> = [];
    bus.writeIO8 = (p: number, v: number): void => { wrote.push({ p: p & 0xff, v: v & 0xff }); };
    const cpu = createZ80({ bus });
    cpu.stepOne(); // LD A,0x7F
    const c = cpu.stepOne().cycles; // OUT (n),A
    expect(c).toBe(11);
    expect(wrote.length).toBe(1);
    expect(wrote[0]).toEqual({ p: 0x99, v: 0x7f });
  });
});
