import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

/**
 * Reproduces the early BIOS CALL/RET path we saw in MAME:
 *   7DA7: CALL 9E02
 *   9E02: RET
 * Stack pointer is set to DFF0 so the CALL must push 0x7DAA to DFEE/DFEF (lo/hi).
 */
describe('Z80 CALL/RET stack correctness', () => {
  it('pushes 0x7DAA at DFEE/DFEF and RET returns to 0x7DAA', () => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();

    // Program bytes:
    // 0000: LD SP,DFF0
    // 0003: JP 7DA7
    // 7DA7: CALL 9E02
    // 7DAA: NOP (return target)
    // 9E02: RET
    mem.set([0x31, 0xF0, 0xDF], 0x0000); // LD SP,DFF0
    mem.set([0xC3, 0xA7, 0x7D], 0x0003); // JP 7DA7
    mem.set([0xCD, 0x02, 0x9E, 0x00], 0x7DA7); // CALL 9E02 ; NOP at 7DAA
    mem.set([0xC9], 0x9E02); // RET

    const cpu = createZ80({ bus });

    // Execute LD SP,DFF0
    step(cpu);
    expect(cpu.getState().sp & 0xffff).toBe(0xDFF0);

    // Jump to 7DA7
    step(cpu);
    expect(cpu.getState().pc & 0xffff).toBe(0x7DA7);

    // Execute CALL 9E02
    step(cpu);
    // After CALL, PC at subroutine and SP should be DFEE
    const sAfterCall = cpu.getState();
    expect(sAfterCall.pc & 0xffff).toBe(0x9E02);
    expect(sAfterCall.sp & 0xffff).toBe(0xDFEE);

    // Check stack contents: DFEE=0xAA (lo), DFEF=0x7D (hi)
    expect(mem[0xDFEE]).toBe(0xAA);
    expect(mem[0xDFEF]).toBe(0x7D);

    // Execute RET
    step(cpu);
    const sAfterRet = cpu.getState();
    expect(sAfterRet.pc & 0xffff).toBe(0x7DAA);
    expect(sAfterRet.sp & 0xffff).toBe(0xDFF0);
  });
});
