import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';
import type { Cartridge } from '../../src/bus/bus.js';

// Build a tiny ROM that sets BC to a small count and loops:
// loop: DEC BC; LD A,B; OR C; JR NZ,loop; HALT
// IM1 handler at 0x0038 preserves all regs and returns via RETI.
const buildRom = (bcInit: number = 0x0400): Uint8Array => {
  const rom = new Uint8Array(0x4000 * 3);
  let a = 0x0000;
  const emit = (b: number): void => { rom[a++] = b & 0xff; };

  // Program start
  emit(0xf3); // DI
  emit(0x01); // LD BC,nn
  emit(bcInit & 0xff); emit((bcInit >>> 8) & 0xff);
  emit(0xfb); // EI
  // loop:
  emit(0x0b); // DEC BC
  emit(0x78); // LD A,B
  emit(0xb1); // OR C
  emit(0x20); emit(0xfb); // JR NZ,-5 (back to DEC BC)
  emit(0x76); // HALT

  // IM1 handler at 0x0038
  a = 0x0038;
  emit(0xf5); // PUSH AF
  emit(0xc5); // PUSH BC
  emit(0xd5); // PUSH DE
  emit(0xe5); // PUSH HL
  emit(0xe1); // POP HL
  emit(0xd1); // POP DE
  emit(0xc1); // POP BC
  emit(0xf1); // POP AF
  emit(0xed); emit(0x4d); // RETI

  return rom;
};

describe('Z80 IM1 preserves BC across IRQs (BIOS-like DEC/OR/JR loop)', (): void => {
  it('loop exits (BC reaches 0) even when VBlank IRQs fire', (): void => {
    const cart: Cartridge = { rom: buildRom(0x0220) };
    const mach = createMachine({ cart });
    const vdp = mach.getVDP() as any;

    // Enable VBlank IRQ (reg1 bit5)
    const writeVdpReg = (reg: number, val: number): void => { vdp.writePort(0xbf, val & 0xff); vdp.writePort(0xbf, 0x80 | (reg & 0x0f)); };
    writeVdpReg(1, 0x20);

    // Run enough cycles for a couple of frames so IM1 will fire repeatedly
    const cpl = vdp.getState().cyclesPerLine as number;
    const LINES = 262;
    mach.runCycles(4 * LINES * cpl);

    const s = mach.getCPU().getState();
    // Loop should have exited; BC should be 0 at exit
    const bc = ((s.b & 0xff) << 8) | (s.c & 0xff);
    expect(bc).toBe(0x0000);
    // Note: HALT may or may not still be set depending on IRQ timing; don't assert it here.
  });
});
