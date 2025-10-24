import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

// Program:
// 0000: LD BC,1234h; EI; NOP; HALT
// 0038: PUSH AF; PUSH BC; PUSH DE; PUSH HL; POP HL; POP DE; POP BC; POP AF; RETI

describe('Z80 IM1 simple ISR preserves BC', (): void => {
  it('BC unchanged across one IM1 acceptance', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    let a = 0x0000;
    const emit = (b: number): void => { mem[a++] = b & 0xff; };

    // Main
    emit(0x01); emit(0x34); emit(0x12); // LD BC,1234h
    emit(0xfb); // EI
    emit(0x00); // NOP
    emit(0x76); // HALT

    // ISR at 0x0038
    a = 0x0038;
    emit(0xf5); emit(0xc5); emit(0xd5); emit(0xe5);
    emit(0xe1); emit(0xd1); emit(0xc1); emit(0xf1);
    emit(0xed); emit(0x4d); // RETI

    const cpu = createZ80({ bus });

    // Execute LD BC
    step(cpu);
    // EI
    step(cpu);
    // Request IRQ but EI-delay masks for one instruction
    cpu.requestIRQ();
    // NOP (masked)
    step(cpu);
    // Next step executes HALT (no acceptance yet)
    step(cpu);
    expect(cpu.getState().halted).toBe(true);
    // Now IRQ should be accepted on this step
    const res = cpu.stepOne();
    expect(res.irqAccepted).toBe(true);
    expect(cpu.getState().pc & 0xffff).toBe(0x0038);
    // Inspect stack bytes for pushed PC (should be 00 06 at [SP+1],[SP])
    const stPush = cpu.getState();
    const sp = stPush.sp & 0xffff;
    const lo = (mem[sp & 0xffff] ?? 0) & 0xff;
    const hi = (mem[(sp + 1) & 0xffff] ?? 0) & 0xff;
    expect(lo).toBe(0x06);
    expect(hi).toBe(0x00);
    // Run ISR fully (9 ops including RETI)
    for (let i = 0; i < 9; i++) step(cpu);
    // After RETI, back to PC after HALT (0x0006)
    const s = cpu.getState();
    expect(s.pc & 0xffff).toBe(0x0006);
    const bc = ((s.b & 0xff) << 8) | (s.c & 0xff);
    expect(bc).toBe(0x1234);
  });
});
