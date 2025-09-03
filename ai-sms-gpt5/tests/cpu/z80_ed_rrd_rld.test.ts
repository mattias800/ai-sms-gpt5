import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_PV, FLAG_S, FLAG_Z, FLAG_C } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 ED RRD/RLD', (): void => {
  it('RRD rotates nibbles between A and (HL), flags from A, C preserved, 18 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4000; LD A,0xAB; LD (HL),0xCD; ED 67 (RRD)
    mem.set([0x21, 0x00, 0x40, 0x3e, 0xab, 0x36, 0xcd, 0xed, 0x67], 0x0000);
    const cpu = createZ80({ bus });
    // Seed carry to verify preserved
    const s0 = cpu.getState();
    cpu.setState({ ...s0, f: s0.f | FLAG_C });
    step(cpu); // LD HL
    step(cpu); // LD A
    step(cpu); // LD (HL)
    const c = step(cpu); expect(c).toBe(18);
    const st = cpu.getState();
    // RRD: new (HL) = ((A low << 4) | (M >> 4)) = ((0xB<<4)|(0xCD>>4)=0xB0|0x0C=0xBC)
    //       new A = (A high | (M low)) = 0xA0 | 0x0D = 0xAD
    expect(mem[0x4000]).toBe(0xbc);
    expect(st.a).toBe(0xad);
    // Flags from A=0xAD: S=1, Z=0, PV=parity(0xAD=false)
    expect((st.f & FLAG_S) !== 0).toBe(true);
    expect((st.f & FLAG_Z) !== 0).toBe(false);
    expect((st.f & FLAG_PV) !== 0).toBe(false);
    // Carry preserved
    expect((st.f & FLAG_C) !== 0).toBe(true);
  });

  it('RLD rotates nibbles left between (HL) and A, flags from A, 18 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4100; LD A,0x12; LD (HL),0x34; ED 6F (RLD)
    mem.set([0x21, 0x00, 0x41, 0x3e, 0x12, 0x36, 0x34, 0xed, 0x6f], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu); // LD HL
    step(cpu); // LD A
    step(cpu); // LD (HL)
    const c = step(cpu); expect(c).toBe(18);
    const st = cpu.getState();
    // RLD: new (HL) = ((M << 4) | (A low)) = (0x34<<4 | 0x2) = 0x40 | 0x02 = 0x42
    //      new A = (A high | (M >> 4)) = 0x10 | 0x03 = 0x13
    expect(mem[0x4100]).toBe(0x42);
    expect(st.a).toBe(0x13);
    // Flags from A=0x13: S=0, Z=0, PV=parity(0x13=false)
    expect((st.f & FLAG_S) !== 0).toBe(false);
    expect((st.f & FLAG_Z) !== 0).toBe(false);
    expect((st.f & FLAG_PV) !== 0).toBe(false);
  });
});

