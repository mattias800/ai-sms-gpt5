import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

describe('VDP HCounter timing and snapping behavior', (): void => {
  it('returns 0x00 during front porch at start of line', (): void => {
    const vdp = createVDP();
    // At reset, cycleAcc=0 -> front porch -> 0x00
    const hc = vdp.readPort(0x7e) & 0xff;
    expect(hc).toBe(0x00);
  });

  it('returns 0xB0 during hblank plateau near end of line', (): void => {
    const vdp = createVDP();
    const state = vdp.getState!();
    const cyclesPerLine = state.cyclesPerLine | 0;
    // Advance to inside the hblank plateau region (last ~40 cycles of the line)
    const plateauStart = cyclesPerLine - 2; // comfortably inside plateau
    vdp.tickCycles(plateauStart);
    const hc = vdp.readPort(0x7e) & 0xff;
    expect(hc).toBe(0xb0);
  });

  it('quantizes HCounter based on hcQuantStep when not in front/hblank windows', (): void => {
    // Use a larger quantization step to make behavior visible
    const vdp = createVDP({ hcQuantStep: 0x10 });
    const state = vdp.getState!();
    const cyclesPerLine = state.cyclesPerLine | 0;

    // Pick a raw target around 0x23 (not near 0x00/0xB0, outside front porch/hblank)
    const targetRaw = 0x23;
    let cycles = Math.floor(((targetRaw + 0.5) * cyclesPerLine) / 256);
    // Ensure we are outside default front porch (16) and not in default hblank (last 40 cycles)
    if (cycles <= 16) cycles = 20;
    if (cycles >= cyclesPerLine - 40) cycles = cyclesPerLine - 50;
    vdp.tickCycles(cycles);
    const hc = vdp.readPort(0x7e) & 0xff;
    // With step=0x10, quantized result should be 0x20 (and not 0x23)
    expect(hc).toBe(0x20);
  });

  it('snaps near 0xB0 to exactly 0xB0 within snap window', (): void => {
    const vdp = createVDP();
    const state = vdp.getState!();
    const cyclesPerLine = state.cyclesPerLine | 0;
    // Choose a raw value near 0xB0 but not in the plateau region
    const targetRaw = 0xb0 - 5; // within default snapB0Window (20)
    let cycles = Math.floor(((targetRaw + 0.5) * cyclesPerLine) / 256);
    // Ensure not in front porch and not in hblank plateau (use defaults 16 and 40)
    if (cycles <= 16) cycles = 20;
    if (cycles >= cyclesPerLine - 40) cycles = cyclesPerLine - 50;
    vdp.tickCycles(cycles);
    const hc = vdp.readPort(0x7e) & 0xff;
    expect(hc).toBe(0xb0);
  });

  it('snaps near 0x03 when front porch is disabled', (): void => {
    // Disable front porch so we can see early-line values around 0x03
    const vdp = createVDP({ frontPorchCycles: 0, snap03Window: 8 });
    const state = vdp.getState!();
    const cyclesPerLine = state.cyclesPerLine | 0;
    const targetRaw = 0x03 - 1; // within snap window
    const cycles = Math.floor(((targetRaw + 0.25) * cyclesPerLine) / 256);
    vdp.tickCycles(cycles);
    const hc = vdp.readPort(0x7e) & 0xff;
    expect(hc).toBe(0x03);
  });
});

