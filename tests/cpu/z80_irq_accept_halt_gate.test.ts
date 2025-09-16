import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IRQ acceptance gating around HALT and IM2', (): void => {
  it('accepts IRQ even if next op is HALT when IRQ was just requested', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; HALT
    mem.set([0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Enable maskable IRQs
    const st0 = cpu.getState();
    cpu.setState({ ...st0, iff1: true, iff2: true });

    // Execute NOP at PC=0
    expect(step(cpu)).toBe(4);

    // Request IRQ immediately before next step (pc now at 1 -> HALT)
    cpu.requestIRQ();
    const res = cpu.stepOne();
    // Should accept IRQ in IM1 (default) with 13 cycles
    expect(res.cycles).toBe(13);
    const st = cpu.getState();
    expect(st.pc).toBe(0x0038);
  });

  it('accepts IM2 IRQ and vectors via table', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; NOP (just filler)
    mem.set([0x00, 0x00], 0x0000);
    // IM2 vector table entry at (I<<8 | VEC) = (0x12<<8 | 0x34) = 0x1234 pointer stored at 0x1234 address bytes at 0x1234??
    // For IM2, CPU reads two bytes from (I<<8 | vector). We'll choose I=0x12, vector=0x34, and set memory[0x1234]=0x78 (lo), memory[0x1235]=0x56 (hi) -> jump to 0x5678
    mem[0x1234] = 0x78;
    mem[0x1235] = 0x56;

    const cpu = createZ80({ bus });
    // Configure IM2
    const st0 = cpu.getState();
    cpu.setState({ ...st0, iff1: true, iff2: true, im: 2, i: 0x12 });
    cpu.setIM2Vector(0x34);

    // Ensure next op is not HALT and request IRQ just before step
    cpu.requestIRQ();
    const res = cpu.stepOne();
    expect(res.cycles).toBe(19); // IM2 acceptance cycles
    const st = cpu.getState();
    expect(st.pc).toBe(0x5678);
  });
});
