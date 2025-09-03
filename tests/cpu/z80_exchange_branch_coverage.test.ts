import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Exchange and 16-bit LD branch coverage', (): void => {
  it('EX AF,AF\' twice restores original AF', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // EX AF,AF'; EX AF,AF'
    mem.set([0x08, 0x08], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x12, f: 0x34 });

    step(cpu); // exchange with AF'
    // A,F now unknown (previous AF'), but after second exchange should restore
    step(cpu);
    const s2 = cpu.getState();
    expect(s2.a).toBe(0x12);
    expect(s2.f).toBe(0x34);
  });

  it('LD DE,nn loads immediate 16-bit value', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0x11, 0x34, 0x12], 0x0000); // LD DE,0x1234
    const cpu = createZ80({ bus });
    const c = step(cpu);
    expect(c).toBe(10);
    const s = cpu.getState();
    expect(((s.d << 8) | s.e) & 0xffff).toBe(0x1234);
  });
});

