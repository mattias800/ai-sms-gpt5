import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IM1 ISR using EXX/EX AF preserves main BC', (): void => {
  it('EXX/EX AF,AF\' in ISR does not alter main BC', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    let a = 0x0000;
    const emit = (b: number): void => { mem[a++] = b & 0xff; };

    // Main: LD BC,1234; EI; NOP; HALT
    emit(0x01); emit(0x34); emit(0x12);
    emit(0xfb);
    emit(0x00);
    emit(0x76);

    // ISR at 0x0038
    a = 0x0038;
    emit(0x08); // EX AF,AF'
    emit(0xd9); // EXX (swap BC,DE,HL with alternates)
    // Modify alternate BC' to random values
    emit(0x06); emit(0xAA); // LD B,0xAA (now affects alt B')
    emit(0x0e); emit(0x55); // LD C,0x55 (affects alt C')
    emit(0xd9); // EXX back
    emit(0x08); // EX AF,AF' back
    emit(0xed); emit(0x4d); // RETI

    const cpu = createZ80({ bus });
    // LD BC
    step(cpu);
    // EI
    step(cpu);
    // Request IRQ; NOP executes due to EI delay
    cpu.requestIRQ();
    step(cpu); // NOP
    // HALT
    step(cpu);
    // Accept IRQ
    const r = cpu.stepOne();
    expect(r.irqAccepted).toBe(true);
    // Execute ISR: EX AF,AF'; EXX; LD B,AA; LD C,55; EXX; EX AF,AF'; RETI
    for (let i = 0; i < 7; i++) step(cpu);
    // After RETI, back to PC after HALT
    const s = cpu.getState();
    expect(s.pc & 0xffff).toBe(0x0006);
    const bc = ((s.b & 0xff) << 8) | (s.c & 0xff);
    expect(bc).toBe(0x1234);
  });
});
