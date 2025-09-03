import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

describe('VDP IRQ enable during active VBlank', (): void => {
  it('asserts IRQ immediately when R1 bit5 is set while already in VBlank', (): void => {
    const vdp = createVDP();
    const gs0 = (vdp as any).getState?.();
    const cpl = gs0.cyclesPerLine as number;

    // Advance to VBlank start line (default 192)
    vdp.tickCycles(192 * cpl);

    // Initially, IRQ should not be asserted because R1 bit5 is not set.
    expect((vdp as any).hasIRQ()).toBe(false);

    // Enable VBlank IRQ in R1 during active VBlank.
    vdp.writePort(0xbf, 0x20);
    vdp.writePort(0xbf, 0x80 | 0x01);

    // When enabling during VBlank, the IRQ line should assert immediately.
    expect((vdp as any).hasIRQ()).toBe(true);
  });
});

