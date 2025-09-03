import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type WaitStateHooks } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 wait-state hooks fallback branches', (): void => {
  it('uses onMemoryRead/onIOWrite when memPenalty/ioPenalty are not provided', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: OUT (0xFE),A ; HALT
    mem.set([0xd3, 0xfe, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      onMemoryRead: () => 1, // opcode + immediate fetch => +2
      onIOWrite: () => 3, // IO write => +3
      includeWaitInCycles: true,
    };
    const cpu = createZ80({ bus, waitStates: ws });

    // Execute OUT (0xFE),A
    step(cpu);
    // Next step executes HALT; last wait cycles should reflect: 3 (opcode peek+fetch + imm fetch) + 3 (IO write) = 6
    step(cpu);
    expect(cpu.getLastWaitCycles()).toBe(6);
  });
});
