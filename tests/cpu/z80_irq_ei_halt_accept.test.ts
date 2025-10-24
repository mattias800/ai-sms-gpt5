import { describe, it, expect } from 'vitest';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { SimpleBus } from '../../src/bus/bus.js';

// Utility to build a small program in RAM
const loadBytes = (mem: Uint8Array, addr: number, bytes: number[]): void => {
  for (let i = 0; i < bytes.length; i++) mem[(addr + i) & 0xffff] = (bytes[i] ?? 0) & 0xff;
};

describe('Z80 IRQ acceptance around EI/HALT and IFF restore', () => {
  it('accepts IRQ while HALTed immediately after EI; HALT and restores IFF1 via RETI', () => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at 0x0000: EI ; HALT ; NOP (should not be reached before IRQ)
    loadBytes(mem, 0x0000, [0xfb, 0x76, 0x00]);
    // Interrupt vector at 0x0038: RETI ; NOP
    loadBytes(mem, 0x0038, [0xed, 0x4d, 0x00]);

    const cpu = createZ80({ bus });

    // Step 1: EI (interrupts become enabled after the next instruction)
    let r = cpu.stepOne();
    expect(r.irqAccepted).toBeFalsy();
    let s = cpu.getState();
    expect(s.iff1).toBeFalsy(); // still pending

    // Step 2: HALT, then request IRQ
    r = cpu.stepOne();
    s = cpu.getState();
    expect(s.halted).toBeTruthy();
    cpu.requestIRQ();

    // Step 3: IRQ should wake from HALT and jump to 0x0038 (IM1)
    r = cpu.stepOne();
    s = cpu.getState();
    expect(r.irqAccepted).toBeTruthy();
    expect(s.halted).toBeFalsy();
    expect(s.pc & 0xffff).toBe(0x0038);
    // After accept, IFF1 should be cleared
    expect(s.iff1).toBeFalsy();

    // Step 4: Execute RETI at 0x0038, which should restore IFF1 := IFF2
    r = cpu.stepOne();
    s = cpu.getState();
    // IFF2 held the previous IFF1 (true), so RETI should restore IFF1=true
    expect(s.iff1).toBeTruthy();
    // Return address should be 0x0002 (pointing after HALT)
    expect(s.pc & 0xffff).toBe(0x0002);
  });

  it('preempts HALT fetch when IRQ is pending and IFF1=1 (no HALT executed)', () => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI ; NOP ; HALT ; NOP
    loadBytes(mem, 0x0000, [0xfb, 0x00, 0x76, 0x00]);
    // Vector: RETI
    loadBytes(mem, 0x0038, [0xed, 0x4d]);

    const cpu = createZ80({ bus });

    // EI
    cpu.stepOne();
    // NOP commits EI pending -> IFF1 now enabled
    cpu.stepOne();
    let s = cpu.getState();
    expect(s.iff1).toBeTruthy();

    // Request IRQ while next opcode would be HALT
    cpu.requestIRQ();
    const r = cpu.stepOne();
    s = cpu.getState();
    // Should accept IRQ and NOT execute HALT
    expect(r.irqAccepted).toBeTruthy();
    expect(s.halted).toBeFalsy();
    expect(s.pc & 0xffff).toBe(0x0038);
  });
});
