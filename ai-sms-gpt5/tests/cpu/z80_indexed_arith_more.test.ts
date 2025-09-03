import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_Z } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 DD indexed arithmetic more branches', (): void => {
  it('ADC/SBC/AND/XOR/OR/CP with (IX+d) each execute correct path', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: ADC A,(IX+0); SBC A,(IX+1); AND (IX+2); XOR (IX+3); OR (IX+4); CP (IX+5)
    mem.set([
      0x3e, 0x10,       // LD A,0x10
      0xdd, 0x8e, 0x00, // ADC A,(IX+0)
      0x3e, 0x20,       // LD A,0x20
      0xdd, 0x9e, 0x01, // SBC A,(IX+1)
      0x3e, 0xf0,       // LD A,0xF0
      0xdd, 0xa6, 0x02, // AND (IX+2)
      0x3e, 0xaa,       // LD A,0xAA
      0xdd, 0xae, 0x03, // XOR (IX+3)
      0x3e, 0x0f,       // LD A,0x0F
      0xdd, 0xb6, 0x04, // OR (IX+4)
      0x3e, 0x10,       // LD A,0x10
      0xdd, 0xbe, 0x05, // CP (IX+5)
    ], 0x0000);
    const cpu = createZ80({ bus });
    // Seed IX and memory values
    let st = cpu.getState();
    cpu.setState({ ...st, ix: 0x4000, f: (st.f | FLAG_C) & 0xff }); // set C for ADC
    mem[0x4000] = 0x01;
    mem[0x4001] = 0x02;
    mem[0x4002] = 0x0f;
    mem[0x4003] = 0x55;
    mem[0x4004] = 0xf0;
    mem[0x4005] = 0x20;

    // ADC => 0x10 + 0x01 + C(1) = 0x12
    step(cpu); // LD A
    let c = step(cpu); expect(c).toBe(19);
    st = cpu.getState(); expect(st.a).toBe(0x12);

    // SBC => 0x20 - 0x02 - C(0) = 0x1E
    step(cpu); // LD A
    c = step(cpu); expect(c).toBe(19);
    st = cpu.getState(); expect(st.a).toBe(0x1e);

    // AND => 0xF0 & 0x0F = 0x00
    step(cpu); // LD A
    c = step(cpu); expect(c).toBe(19);
    st = cpu.getState(); expect(st.a).toBe(0x00);
    expect((st.f & FLAG_Z) !== 0).toBe(true);

    // XOR => 0xAA ^ 0x55 = 0xFF
    step(cpu); // LD A
    c = step(cpu); expect(c).toBe(19);
    st = cpu.getState(); expect(st.a).toBe(0xff);

    // OR => 0x0F | 0xF0 = 0xFF
    step(cpu); // LD A
    c = step(cpu); expect(c).toBe(19);
    st = cpu.getState(); expect(st.a).toBe(0xff);

    // CP => compare 0x10 vs 0x20 sets carry
    step(cpu); // LD A
    c = step(cpu); expect(c).toBe(19);
    st = cpu.getState(); expect((st.f & FLAG_C) !== 0).toBe(true);
  });
});

