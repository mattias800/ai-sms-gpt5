import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

// Timing-focused tests for VDP counters and VBlank behavior

describe('VDP timing (HCounter/VCounter/VBlank)', (): void => {
  it('HCounter front porch returns 0x00, end-of-line returns 0xB0', (): void => {
    const vdp = createVDP();
    // At start, within front porch
    const h0 = vdp.readPort(0x7e) & 0xff;
    expect(h0).toBe(0x00);

    // Move near end of the line (cyclesPerLine-2) and read
    const gs0 = (vdp as any).getState?.();
    const cpl = gs0?.cyclesPerLine ?? 228;
    vdp.tickCycles((cpl - 2) | 0);
    const h1 = vdp.readPort(0x7e) & 0xff;
    expect(h1).toBe(0xb0);
  });

  it('VCounter increases after a full line and VBlank sets status bit 7', (): void => {
    const vdp = createVDP();
    const v0 = vdp.readPort(0x7f) & 0xff;

    const gs = (vdp as any).getState?.();
    expect(gs).toBeTruthy();
    const cpl = gs.cyclesPerLine as number;

    // Advance a full line; VCounter should change
    vdp.tickCycles(cpl);
    const v1 = vdp.readPort(0x7f) & 0xff;
    expect(v1).not.toBe(v0);

    // Advance to VBlank start; status bit 7 should set
    // vblankStartLine defaults to 192; we are at line 1 now; advance (192-1) lines
    const linesToVBlank = 191;
    vdp.tickCycles((linesToVBlank * cpl) | 0);
    const statusBefore = (vdp as any).getState?.().status as number;
    expect((statusBefore & 0x80) !== 0).toBe(true);

    // Reading status clears bit 7
    const stRead = vdp.readPort(0xbf) & 0xff;
    expect((stRead & 0x80) !== 0).toBe(true);
    const statusAfter = (vdp as any).getState?.().status as number;
    expect((statusAfter & 0x80) !== 0).toBe(false);
  });
});
