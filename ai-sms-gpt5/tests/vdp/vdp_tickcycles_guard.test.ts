import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

describe('VDP tickCycles guards', (): void => {
  it('handles negative cycles safely and keeps counters in range', (): void => {
    const vdp = createVDP();
    const gs0 = (vdp as any).getState?.();
    const cpl = gs0.cyclesPerLine as number;

    // Apply negative cycles. Should not underflow line counter.
    vdp.tickCycles(-1000);

    // Line should remain at 0 as no full line elapsed.
    expect((vdp.readPort(0x7f) & 0xff)).toBe(0x00);

    // Apply small positive cycles < one line
    vdp.tickCycles(Math.floor(cpl / 2));
    // Still line 0.
    expect((vdp.readPort(0x7f) & 0xff)).toBe(0x00);

  });
});

