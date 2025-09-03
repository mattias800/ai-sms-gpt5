import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_PV, FLAG_S, FLAG_Z } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 ED IN r,(C) and OUT (C),r', (): void => {
  it('IN B,(C) reads 0xFF from port 0x7f, sets flags, 12 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD C,0x7f; IN B,(C)
    mem.set([0x0e, 0x7f, 0xed, 0x40], 0x0000);
    const cpu = createZ80({ bus });
    let c = step(cpu);
    expect(c).toBe(7); // LD C
    c = step(cpu);
    expect(c).toBe(12); // IN B,(C)
    const st = cpu.getState();
    expect(st.b).toBe(0xff);
    // Flags: S=1, Z=0, PV=1 for 0xFF
    expect((st.f & FLAG_S) !== 0).toBe(true);
    expect((st.f & FLAG_Z) !== 0).toBe(false);
    expect((st.f & FLAG_PV) !== 0).toBe(true);
  });

  it('OUT (C),A takes 12 cycles and leaves flags unaffected', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD C,0x7f; LD A,0x55; OUT (C),A
    mem.set([0x0e, 0x7f, 0x3e, 0x55, 0xed, 0x79], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu); // LD C
    step(cpu); // LD A
    const f0 = cpu.getState().f;
    const c = step(cpu);
    expect(c).toBe(12); // OUT (C),A
    const f1 = cpu.getState().f;
    expect(f1).toBe(f0);
  });

  it('IN (C) (ED 70) updates flags from port and does not change registers', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD C,0x7f; IN (C)
    mem.set([0x0e, 0x7f, 0xed, 0x70], 0x0000);
    const cpu = createZ80({ bus });
    const st0 = cpu.getState();
    step(cpu); // LD C
    step(cpu); // IN (C)
    const st = cpu.getState();
    // Registers unchanged except flags
    expect(st.a).toBe(st0.a);
    expect(st.b).toBe(st0.b);
    // Flags updated: for 0xFF, S=1, Z=0, PV=1
    expect((st.f & FLAG_S) !== 0).toBe(true);
    expect((st.f & FLAG_Z) !== 0).toBe(false);
    expect((st.f & FLAG_PV) !== 0).toBe(true);
  });

  it('OUT (C),0 (ED 71) takes 12 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD C,0x7f; OUT (C),0
    mem.set([0x0e, 0x7f, 0xed, 0x71], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu); // LD C
    const c = step(cpu); // OUT (C),0
    expect(c).toBe(12);
  });
});
