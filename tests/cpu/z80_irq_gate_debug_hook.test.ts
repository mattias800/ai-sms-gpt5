import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 onIrqGate debug hook reasons', (): void => {
  it("emits 'iff1=0' when IRQ pending but IFF1 is 0", (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP
    mem.set([0x00], 0x0000);

    const events: { pc: number; reason: string }[] = [];
    const cpu = createZ80({
      bus,
      debugHooks: {
        onIrqGate: (pc, reason): void => {
          events.push({ pc, reason });
        },
      },
    });

    // Disable maskable IRQs and request one; it should be gated for reason 'iff1=0'
    const st0 = cpu.getState();
    cpu.setState({ ...st0, iff1: false, iff2: false });
    cpu.requestIRQ();
    const c = step(cpu); // executes NOP, does not accept IRQ
    expect(c).toBe(4);
    expect(events.some(e => e.reason === 'iff1=0')).toBe(true);
  });

  it("emits 'ei-mask1' on the instruction immediately after EI when an IRQ is pending", (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; NOP
    mem.set([0xfb, 0x00], 0x0000);

    const events: { pc: number; reason: string }[] = [];
    const cpu = createZ80({
      bus,
      debugHooks: {
        onIrqGate: (pc, reason): void => {
          events.push({ pc, reason });
        },
      },
    });

    // Execute EI, then request IRQ; next instruction should be masked for one step
    step(cpu); // EI
    cpu.requestIRQ();
    const c = step(cpu); // NOP executes; acceptance is gated by EI mask-one
    expect(c).toBe(4);
    expect(events.some(e => e.reason === 'ei-mask1')).toBe(true);
  });

  it("emits 'halt-gate' when next opcode is HALT and IRQ was not just requested", (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; HALT; NOP (to have a safe byte after HALT)
    mem.set([0x00, 0x76, 0x00], 0x0000);

    const events: { pc: number; reason: string }[] = [];
    const cpu = createZ80({
      bus,
      debugHooks: {
        onIrqGate: (pc, reason): void => {
          events.push({ pc, reason });
        },
      },
    });

    // Make IFF1=0 initially so the first step (NOP) will not accept the IRQ, ensuring
    // irqJustRequested is false by the time we reach the HALT step.
    const st0 = cpu.getState();
    cpu.setState({ ...st0, iff1: false, iff2: false });
    cpu.requestIRQ();

    // Step 0: NOP executes; gated for reason 'iff1=0'
    step(cpu);

    // Enable IFF1 before the HALT step
    const st1 = cpu.getState();
    cpu.setState({ ...st1, iff1: true, iff2: true });

    // Step 1: Next op is HALT; since irqJustRequested is false, it should gate for 'halt-gate'
    const c = step(cpu);
    expect(c).toBe(4);
    expect(events.some(e => e.reason === 'halt-gate')).toBe(true);
  });
});

