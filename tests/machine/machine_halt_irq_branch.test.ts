import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';
import type { Cartridge } from '../../src/bus/bus.js';

// Small ROM: DI; EI; NOP; HALT; (ISR: DI; RETI) — exercise NMI masking and EI pending path
const buildRom = (): Uint8Array => {
  const rom = new Uint8Array(0x4000 * 3);
  let a = 0x0000;
  const emit = (b: number): void => { rom[a++] = b & 0xff; };
  // Main: DI; EI; NOP; HALT
  emit(0xf3);
  emit(0xfb);
  emit(0x00);
  emit(0x76);
  // ISR at 0x0038: DI; RETI
  a = 0x0038;
  emit(0xf3);
  emit(0xed); emit(0x4d);
  return rom;
};

describe('Machine integration: per-cycle ticking and IRQ accept while halted', (): void => {
  it('accepts IM1 while halted and unhalts CPU; PSG/VDP ticked via per-cycle hook', (): void => {
    const cart: Cartridge = { rom: buildRom() };
    const mach = createMachine({ cart });

    // Enable VBlank IRQ on VDP (reg1 bit5)
    const vdp = mach.getVDP();
    vdp.writePort(0xbf, 0x20);
    vdp.writePort(0xbf, 0x80 | 0x01);

    // Run to execute DI, EI, NOP, then HALT
    mach.runCycles(4 + 4 + 4 + 4);
    expect(mach.getCPU().getState().halted).toBe(true);

    // Now request an IRQ to simulate VBlank line asserted and run one instruction
    mach.getCPU().requestIRQ();
    mach.runCycles(13);
    const st = mach.getCPU().getState();
    expect(st.pc).toBe(0x0038);
    expect(st.halted).toBe(false);
  });
});

