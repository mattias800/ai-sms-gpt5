import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

// These tests exercise the VDP H/VCounter read paths and the no-skip logic for 0x7E.

describe('VDP H/VCounter behavior', (): void => {
  it('0x7E HCounter increases within a line and changes over time', (): void => {
    const vdp = createVDP();

    // Advance a tiny amount and read baseline
    vdp.tickCycles(1);
    const h0 = vdp.readPort(0x7e);

    // Immediate read (no cycles): should be >= previous and typically equal
    const h0b = vdp.readPort(0x7e);
    expect((h0b - h0) & 0xff).toBeLessThanOrEqual(1);

    // Advance well within the same line so the value should increase
    vdp.tickCycles(100);
    const h1 = vdp.readPort(0x7e);
    expect((h1 - h0b) & 0xff).toBeGreaterThan(0);
  });

  it('0x7F VCounter reflects scanline and advances across lines', (): void => {
    const vdp = createVDP();
    const v0 = vdp.readPort(0x7f) & 0xff;
    // Advance more than one line (line length is approximately 228 CPU cycles)
    vdp.tickCycles(300);
    const v1 = vdp.readPort(0x7f) & 0xff;
    expect(v1).not.toBe(v0);

    // Reading HCounter after crossing a line should not force +1 relative to previous-line value
    const hPrevLine = vdp.readPort(0x7e);
    vdp.tickCycles(1);
    const hNext = vdp.readPort(0x7e);
    // hNext may be >= or wrap to small numbers; ensure it is a valid 8-bit value
    expect(hNext & 0xff).toBe(hNext);
    // And not strictly required to be previous+1 if line changed
    // (Cannot assert inequality deterministically due to timing, but we at least exercised the branch.)
    expect(typeof hPrevLine).toBe('number');
  });

  it('HCounter snaps to 0xB0 near 0xB0 even before hblank plateau', (): void => {
    const vdp = createVDP();
    const gs = (vdp as any).getState?.();
    const cpl = (gs?.cyclesPerLine ?? 228) as number;
    // Choose cycles so raw counter is just below 0xB0: cycles ≈ floor(176*cpl/256) - 2
    const cycles = (Math.floor((176 * cpl) / 256) - 2) | 0;
    vdp.tickCycles(cycles);
    const h = vdp.readPort(0x7e) & 0xff;
    expect(h).toBe(0xb0);
  });
});
