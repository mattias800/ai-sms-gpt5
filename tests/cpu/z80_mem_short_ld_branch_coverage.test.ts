import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Short memory LD paths and LD SP,HL branch coverage', (): void => {
  it('LD (BC),A; LD A,(BC); LD (DE),A; LD A,(DE); LD SP,HL', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Sequence: LD (BC),A; LD A,(BC); LD (DE),A; LD A,(DE); LD SP,HL
    mem.set([0x02, 0x0a, 0x12, 0x1a, 0xf9], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0xaa, b: 0x40, c: 0x00, d: 0x40, e: 0x01, h: 0x12, l: 0x34 });

    // LD (BC),A => mem[0x4000]=0xAA
    step(cpu);
    expect(mem[0x4000]).toBe(0xaa);

    // Prepare mem and load A from (BC)
    mem[0x4000] = 0x55;
    step(cpu);
    expect(cpu.getState().a).toBe(0x55);

    // LD (DE),A => mem[0x4001]=0x55
    step(cpu);
    expect(mem[0x4001]).toBe(0x55);

    // Prepare mem and LD A,(DE)
    mem[0x4001] = 0xcc;
    step(cpu);
    expect(cpu.getState().a).toBe(0xcc);

    // LD SP,HL
    step(cpu);
    expect(cpu.getState().sp).toBe(0x1234);
  });
});

