import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

const setIX = (cpu: ReturnType<typeof createZ80>, ix: number): void => {
  const st = cpu.getState();
  cpu.setState({ ...st, ix: ix & 0xffff });
};

const setCarry = (cpu: ReturnType<typeof createZ80>, c: boolean): void => {
  const st = cpu.getState();
  cpu.setState({ ...st, f: c ? st.f | FLAG_C : st.f & ~FLAG_C });
};

describe('DD CB d rotates/shifts coverage on (IX+d)', (): void => {
  it('covers RL, RR(with carry), SLA, SRA, SLL, SRL and updates memory (23 cycles each)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Sequence: RL (IX+2); RR (IX+3); SLA (IX+4); SRA (IX+5); SLL (IX+6); SRL (IX+7); HALT
    mem.set(
      [
        0xdd,
        0xcb,
        0x02,
        0x16, // RL (IX+2)
        0xdd,
        0xcb,
        0x03,
        0x1e, // RR (IX+3)
        0xdd,
        0xcb,
        0x04,
        0x26, // SLA (IX+4)
        0xdd,
        0xcb,
        0x05,
        0x2e, // SRA (IX+5)
        0xdd,
        0xcb,
        0x06,
        0x36, // SLL (IX+6)
        0xdd,
        0xcb,
        0x07,
        0x3e, // SRL (IX+7)
        0x76,
      ],
      0x0000,
    );
    const cpu = createZ80({ bus });
    setIX(cpu, 0x4000);

    // Seed memory for each op
    mem[0x4002] = 0x81; // RL -> 0x02, C=1
    mem[0x4003] = 0x01; // RR with carry=1 -> 0x80
    mem[0x4004] = 0x80; // SLA -> 0x00, C=1
    mem[0x4005] = 0x81; // SRA -> 0xc0
    mem[0x4006] = 0x40; // SLL -> 0x81
    mem[0x4007] = 0x01; // SRL -> 0x00, C=1

    // RL (IX+2)
    let c = step(cpu);
    expect(c).toBe(23);
    expect(mem[0x4002]).toBe(0x02);

    // Ensure carry=1 before RR test
    setCarry(cpu, true);

    // RR (IX+3)
    c = step(cpu);
    expect(c).toBe(23);
    expect(mem[0x4003]).toBe(0x80);

    // SLA (IX+4)
    c = step(cpu);
    expect(c).toBe(23);
    expect(mem[0x4004]).toBe(0x00);

    // SRA (IX+5)
    c = step(cpu);
    expect(c).toBe(23);
    expect(mem[0x4005]).toBe(0xc0);

    // SLL (IX+6)
    c = step(cpu);
    expect(c).toBe(23);
    expect(mem[0x4006]).toBe(0x81);

    // SRL (IX+7)
    c = step(cpu);
    expect(c).toBe(23);
    expect(mem[0x4007]).toBe(0x00);
  });
});
