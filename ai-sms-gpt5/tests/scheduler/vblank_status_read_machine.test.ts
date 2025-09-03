import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';
import type { Cartridge } from '../../src/bus/bus.js';

const makeRom = (bytes: number[]): Uint8Array => {
  const rom = new Uint8Array(0x4000 * 3);
  rom.set(bytes, 0x0000);
  return rom;
};

// Helper to write a VDP register (index, value)
const writeVdpReg = (vdp: any, reg: number, val: number): void => {
  vdp.writePort(0xbf, val & 0xff);
  vdp.writePort(0xbf, 0x80 | (reg & 0x0f));
};

describe('Machine + VDP VBlank IRQ and status read behavior', (): void => {
  it('status read clears VBlank flag and IRQ wire; does not reassert within same VBlank', (): void => {
    const cart: Cartridge = { rom: makeRom([0x00]) }; // NOPs
    const mach = createMachine({ cart });
    const vdp = mach.getVDP() as any;

    // Enable VBlank IRQ (reg1 bit5)
    writeVdpReg(vdp, 1, 0x20);

    const gs0 = vdp.getState?.();
    const cpl = gs0.cyclesPerLine as number;
    const VBL_START = 192; // default in VDP
    const LINES_PER_FRAME = 262; // default in VDP

    // Advance to start of VBlank
    mach.runCycles(VBL_START * cpl);
    expect(vdp.hasIRQ()).toBe(true);

    // Read status; should return bit7 set and clear the wire
    const st1 = vdp.readPort(0xbf) & 0xff;
    expect((st1 & 0x80) !== 0).toBe(true);
    expect(vdp.hasIRQ()).toBe(false);

    // Advance some lines within the same VBlank region; it should not reassert automatically
    mach.runCycles(10 * cpl);
    expect(vdp.hasIRQ()).toBe(false);

    // Advance to end of frame then back to next VBlank start; it should assert again next frame
    const remainingLines = (LINES_PER_FRAME - (VBL_START + 10));
    mach.runCycles(remainingLines * cpl); // finish frame
    mach.runCycles(VBL_START * cpl); // next frame up to VBlank start
    expect(vdp.hasIRQ()).toBe(true);
  });

  it('enabling reg1 bit5 during active VBlank immediately asserts the line (machine integration)', (): void => {
    const cart: Cartridge = { rom: makeRom([0x00]) };
    const mach = createMachine({ cart });
    const vdp = mach.getVDP() as any;

    const gs0 = vdp.getState?.();
    const cpl = gs0.cyclesPerLine as number;
    const VBL_START = 192;

    // Ensure IRQ disabled initially
    writeVdpReg(vdp, 1, 0x00);

    // Enter VBlank with IRQ disabled
    mach.runCycles(VBL_START * cpl);
    expect(vdp.hasIRQ()).toBe(false);

    // Now enable VBlank IRQ while VBlank flag is active
    writeVdpReg(vdp, 1, 0x20);
    expect(vdp.hasIRQ()).toBe(true);
  });
});

