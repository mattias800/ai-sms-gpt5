import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type TraceEvent } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 onTrace hook', (): void => {
  it('reports instruction execution (NOP)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem[0x0000] = 0x00; // NOP
    const events: TraceEvent[] = [];
    const cpu = createZ80({
      bus,
      onTrace: (ev): void => {
        events.push(ev);
      },
    });

    const cycles = step(cpu);
    expect(cycles).toBe(4);
    expect(events.length).toBe(1);
    const e = events[0]!;
    expect(e.pcBefore).toBe(0x0000);
    expect(e.opcode).toBe(0x00);
    expect(e.cycles).toBe(4);
    expect(e.irqAccepted).toBe(false);
    expect(e.nmiAccepted).toBe(false);
  });

  it('reports interrupt acceptance with null opcode (IM1 after EI+HALT)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; HALT
    mem.set([0xfb, 0x76], 0x0000);
    const events: TraceEvent[] = [];
    const cpu = createZ80({
      bus,
      onTrace: (ev): void => {
        events.push(ev);
      },
    });

    // Execute EI and HALT
    expect(step(cpu)).toBe(4);
    expect(step(cpu)).toBe(4);
    // Request IRQ and accept (IM1)
    cpu.requestIRQ();
    const c = step(cpu);
    expect(c).toBe(13);

    // Expect three events overall: EI, HALT, IRQ accept
    expect(events.length).toBe(3);
    const irqEv = events[2]!;
    expect(irqEv.opcode).toBeNull();
    expect(irqEv.irqAccepted).toBe(true);
    expect(irqEv.nmiAccepted).toBe(false);
    expect(irqEv.cycles).toBe(13);
  });
});
