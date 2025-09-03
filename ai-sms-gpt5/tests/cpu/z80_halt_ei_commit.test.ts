import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 EI commit on HALT', (): void => {
  it('EI followed by HALT commits IFF1/2 after HALT executes', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; HALT; NOP (never reached in this test)
    mem.set([0xfb, 0x76, 0x00], 0x0000);
    const cpu = createZ80({ bus });

    // Execute EI
    expect(step(cpu)).toBe(4);
    // Execute HALT — should commit EI pending
    expect(step(cpu)).toBe(4);

    const st = cpu.getState();
    expect(st.iff1).toBe(true);
    expect(st.iff2).toBe(true);
    expect(st.halted).toBe(true);
    // PC advanced to instruction after HALT
    expect(st.pc).toBe(0x0002);
  });
});
