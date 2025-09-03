import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type WaitStateHooks } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 wait-state hooks fallback branches (memory write and IO read)', (): void => {
  it('onMemoryRead + onMemoryWrite accumulate for LD (HL),n', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD (HL),0x12 ; HALT
    mem.set([0x36, 0x12, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      onMemoryRead: () => 1,
      onMemoryWrite: () => 2,
    };
    const cpu = createZ80({ bus, waitStates: ws });
    // Set HL to some addr
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00 });

    step(cpu); // execute LD (HL),n
    step(cpu); // HALT
    // Expected: opcode peek+fetch + imm fetch + memory write = 1+1+1 + 2 = 5
    expect(cpu.getLastWaitCycles()).toBe(5);
  });

  it('onMemoryRead + onIORead accumulate for IN A,(n)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: IN A,(0xFE); HALT
    mem.set([0xdb, 0xfe, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      onMemoryRead: () => 1,
      onIORead: () => 4,
    };
    const cpu = createZ80({ bus, waitStates: ws });

    step(cpu); // IN A,(n)
    step(cpu); // HALT
    // Expected: opcode peek+fetch + imm fetch + IO read = 1+1+1 + 4 = 7
    expect(cpu.getLastWaitCycles()).toBe(7);
  });
});
