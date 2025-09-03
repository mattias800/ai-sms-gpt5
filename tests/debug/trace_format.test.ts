import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { createTraceCollector, formatTrace } from '../../src/debug/trace.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Debug trace formatter', (): void => {
  it('formats lines with text, bytes, cycles, and regs/flags when available', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; LD (HL),34; EI; HALT
    mem.set([0x00, 0x36, 0x34, 0xfb, 0x76], 0x0000);

    const coll = createTraceCollector({ showBytes: true, showFlags: true });
    const cpu = createZ80({ bus, onTrace: coll.onTrace, traceDisasm: true, traceRegs: true });

    step(cpu); // NOP
    step(cpu); // LD (HL),34
    step(cpu); // EI
    step(cpu); // HALT

    // Expect at least 4 lines
    expect(coll.lines.length).toBe(4);
    // Check first line contains mnemonic and PC formatting
    expect(coll.lines[0]).toMatch(/0000: NOP/);
    // Check second line includes bytes and LD mnemonic
    expect(coll.lines[1]).toMatch(/LD \(HL\),34/);
    expect(coll.lines[1]).toMatch(/36 34/);
    // Check EI line is present
    expect(coll.lines[2]).toMatch(/EI/);
    // Check flags and reg summary appended
    expect(coll.lines[1]).toMatch(/F=/);
    expect(coll.lines[1]).toMatch(/AF=/);
  });

  it('formats interrupt acceptance as <INT> with IRQ tag and cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xfb, 0x76], 0x0000); // EI; HALT

    const coll = createTraceCollector({ showBytes: true, showFlags: true });
    const cpu = createZ80({ bus, onTrace: coll.onTrace, traceDisasm: true, traceRegs: true });

    step(cpu); // EI
    step(cpu); // HALT
    // Trigger IM1
    cpu.requestIRQ();
    const c = step(cpu);
    expect(c).toBe(13);

    const last = coll.lines[coll.lines.length - 1]!;
    expect(last).toMatch(/<INT>/);
    expect(last).toMatch(/IRQ/);
    expect(last).toMatch(/cyc=13/);
  });
});
