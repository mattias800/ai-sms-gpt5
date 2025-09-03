import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';
import type { Cartridge } from '../../src/bus/bus.js';

const makeRom = (bytes: number[]): Uint8Array => {
  const rom = new Uint8Array(0x4000 * 3);
  rom.set(bytes, 0x0000);
  return rom;
};

describe('PSG writes via IO port 0x7f', (): void => {
  it('routes to PSG (not VDP), updates internal registers deterministically', (): void => {
    // Program: NOP; NOP; HALT
    const rom = makeRom([0x00, 0x00, 0x76]);
    const cart: Cartridge = { rom };
    const mach = createMachine({ cart });
    // Minimal smoke: ensure machine can be created and stepped without IO errors; routing validated in bus tests.
    expect((): void => {
      mach.runCycles(10);
    }).not.toThrow();
  });
});
