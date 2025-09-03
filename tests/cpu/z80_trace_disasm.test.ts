import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type TraceEvent } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 trace disassembly integration', (): void => {
  it('includes mnemonic text for instructions when traceDisasm is enabled', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; LD (HL),34; HALT
    mem.set([0x00, 0x36, 0x34, 0x76], 0x0000);

    const events: TraceEvent[] = [];
    const cpu = createZ80({
      bus,
      onTrace: (ev): void => {
        events.push(ev);
      },
      traceDisasm: true,
    });

    // NOP
    expect(step(cpu)).toBe(4);
    // LD (HL),34
    expect(step(cpu)).toBe(7);
    // HALT
    expect(step(cpu)).toBe(4);

    expect(events.length).toBe(3);
    expect(events[0]!.text).toBe('NOP');
    expect(events[1]!.text).toBe('LD (HL),34');
    expect(events[2]!.text).toBe('HALT');
  });

  it('does not set text for interrupt acceptance events (opcode null)', (): void => {
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
      traceDisasm: true,
    });

    // EI and HALT
    step(cpu);
    step(cpu);

    // Request IRQ, next step accepts IM1
    const beforeLen = events.length;
    cpu.requestIRQ();
    const c = step(cpu);
    expect(c).toBe(13);
    const lastEv = events[events.length - 1]!;
    expect(events.length).toBe(beforeLen + 1);
    expect(lastEv.opcode).toBeNull();
    expect(lastEv.irqAccepted).toBe(true);
    expect(lastEv.text).toBeUndefined();
  });
});
