import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

// Helpers
const setReg = (vdp: any, idx: number, val: number): void => {
  vdp.writePort(0xbf, val & 0xff);
  vdp.writePort(0xbf, 0x80 | (idx & 0x0f));
};
const setAddrCode = (vdp: any, addr: number, code: number): void => {
  vdp.writePort(0xbf, addr & 0xff);
  vdp.writePort(0xbf, ((addr >>> 8) & 0x3f) | ((code & 0x03) << 6));
};

const writeVRAM = (vdp: any, addr: number, bytes: number[]): void => {
  setAddrCode(vdp, addr & 0x3fff, 1); // VRAM write
  for (const b of bytes) vdp.writePort(0xbe, b & 0xff);
};

const writeCRAMIndex = (vdp: any, idx: number, val: number): void => {
  setAddrCode(vdp, idx & 0x1f, 3); // CRAM write
  vdp.writePort(0xbe, val & 0x3f);
};

// Build a tile with constant color index across all pixels
// colorIdx is 0..15 (4bpp). Build 32-byte SMS Mode 4 tile.
const makeConstantTile = (colorIdx: number): number[] => {
  const out: number[] = [];
  const b0 = (colorIdx & 1) ? 0xff : 0x00;
  const b1 = (colorIdx & 2) ? 0xff : 0x00;
  const b2 = (colorIdx & 4) ? 0xff : 0x00;
  const b3 = (colorIdx & 8) ? 0xff : 0x00;
  for (let y = 0; y < 8; y++) out.push(b0, b1, b2, b3);
  return out;
};

// Build a tile with only left-most pixel set to colorIdx (for all rows)
const makeLeftEdgePixelTile = (colorIdx: number): number[] => {
  const out: number[] = [];
  const m0 = (colorIdx & 1) ? 0x80 : 0x00;
  const m1 = (colorIdx & 2) ? 0x80 : 0x00;
  const m2 = (colorIdx & 4) ? 0x80 : 0x00;
  const m3 = (colorIdx & 8) ? 0x80 : 0x00;
  for (let y = 0; y < 8; y++) out.push(m0, m1, m2, m3);
  return out;
};

// Read RGB triplet from rendered frame at x,y
const rgbAt = (rgb: Uint8Array, x: number, y: number): [number, number, number] => {
  const off = (y * 256 + x) * 3;
  return [(rgb[off] ?? 0), (rgb[off + 1] ?? 0), (rgb[off + 2] ?? 0)];
};

// Convert 6-bit CRAM value to RGB using emulator mapping
const cramToRgb = (v: number): [number, number, number] => {
  const r = ((v & 0x03) * 85) & 0xff;
  const g = (((v >> 2) & 0x03) * 85) & 0xff;
  const b = (((v >> 4) & 0x03) * 85) & 0xff;
  return [r, g, b];
};

// Constants mirrored from default timing
const CYCLES_PER_LINE = 228;

describe('VDP Mode 4: BG palette selection and per-scanline HScroll', (): void => {
  it('BG tiles ignore palette-select bit (use background palette indices 0..15)', (): void => {
    const vdp = createVDP();
    // Display on
    setReg(vdp, 1, 0x40);
    // Name table base -> 0x3800 (R2 bits 3:1 = 111)
    setReg(vdp, 2, 0x0e);

    // CRAM: set color #1 to bright red
    writeCRAMIndex(vdp, 1, 0x03); // RR=3(255), GG=0, BB=0

    // Tile #1: left-edge pixel set to color 1 (rest 0)
    const tile1 = makeLeftEdgePixelTile(1);
    writeVRAM(vdp, 0x0000 + (1 << 5), tile1);

    // Name table (top-left entry) -> tile #1, with palette select bit set in high byte (bit3=1)
    // Entry is 2 bytes: low=tile# low, high: bit0 adds 256, bit3 palette, bit4 priority
    writeVRAM(vdp, 0x3800, [0x01, 0x08]);

    // Render and sample pixel (0,0)
    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();
    const [r, g, b] = rgbAt(rgb!, 0, 0);

    // Expect background palette index 1 (red), not sprite palette offset
    const [er, eg, eb] = cramToRgb(0x03);
    expect([r, g, b]).toEqual([er, eg, eb]);
  });

  it('per-scanline R8 writes change horizontal scroll for that scanline', (): void => {
    const vdp = createVDP();
    // Display on
    setReg(vdp, 1, 0x40);
    // Name table base -> 0x3800
    setReg(vdp, 2, 0x0e);

    // CRAM colors
    writeCRAMIndex(vdp, 1, 0x03); // red
    writeCRAMIndex(vdp, 2, 0x0c); // green

    // Tile #1 = red, Tile #2 = green (constant color tiles)
    writeVRAM(vdp, 0x0000 + (1 << 5), makeConstantTile(1));
    writeVRAM(vdp, 0x0000 + (2 << 5), makeConstantTile(2));

    // Build name table: column 0 -> tile #2 (green), columns 1..31 -> tile #1 (red), all rows
    const nt: number[] = [];
    for (let ty = 0; ty < 24; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        const tile = tx === 0 ? 2 : 1;
        nt.push(tile & 0xff, 0x00);
      }
    }
    writeVRAM(vdp, 0x3800, nt);

    // New frame starts with R8=0 default. Advance to line 80 and set R8=8 (one-tile scroll) for that scanline.
    vdp.tickCycles(80 * CYCLES_PER_LINE);
    setReg(vdp, 8, 8);

    // Render and sample line without write (line 10) and with write (line 80)
    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    // At line 10, x=0 should be column0 tile -> green
    const [gR, gG, gB] = cramToRgb(0x0c);
    const [r10, g10, b10] = rgbAt(rgb!, 0, 10);
    expect([r10, g10, b10]).toEqual([gR, gG, gB]);

    // At line 80, x=0 should reflect scroll of 8 (one tile) -> now shows column1 -> red
    const [rR, rG, rB] = cramToRgb(0x03);
    const [r80, g80, b80] = rgbAt(rgb!, 0, 80);
    expect([r80, g80, b80]).toEqual([rR, rG, rB]);
  });
});
