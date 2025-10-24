import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

const setReg = (vdp: any, idx: number, val: number): void => {
  vdp.writePort(0xbf, val & 0xff);
  vdp.writePort(0xbf, 0x80 | (idx & 0x0f));
};
const setAddrCode = (vdp: any, addr: number, code: number): void => {
  vdp.writePort(0xbf, addr & 0xff);
  vdp.writePort(0xbf, ((addr >>> 8) & 0x3f) | ((code & 0x03) << 6));
};
const writeVRAM = (vdp: any, addr: number, bytes: number[]): void => {
  setAddrCode(vdp, addr & 0x3fff, 1);
  for (const b of bytes) vdp.writePort(0xbe, b & 0xff);
};
const writeCRAMIndex = (vdp: any, idx: number, val: number): void => {
  setAddrCode(vdp, idx & 0x1f, 3);
  vdp.writePort(0xbe, val & 0x3f);
};

// Tile with only top-left pixel set to color 1 (row 0 only)
const makeTopLeftOnlyTile = (): number[] => {
  const out: number[] = [];
  // row 0 has only leftmost pixel
  out.push(0x80, 0x00, 0x00, 0x00);
  // remaining 7 rows are zero
  for (let y = 1; y < 8; y++) out.push(0x00, 0x00, 0x00, 0x00);
  return out;
};

const rgbAt = (rgb: Uint8Array, x: number, y: number): [number, number, number] => {
  const off = (y * 256 + x) * 3;
  return [(rgb[off] ?? 0), (rgb[off + 1] ?? 0), (rgb[off + 2] ?? 0)];
};

const cramToRgb = (v: number): [number, number, number] => {
  const r = ((v & 0x03) * 85) & 0xff;
  const g = (((v >> 2) & 0x03) * 85) & 0xff;
  const b = (((v >> 4) & 0x03) * 85) & 0xff;
  return [r, g, b];
};

describe('VDP sprite magnification (R1 bit0)', (): void => {
  it('doubles sprite dimensions (8x8 -> 16x16) in both axes', (): void => {
    const vdp = createVDP();
    setReg(vdp, 1, 0x40); // display on, zoom off
    setReg(vdp, 6, 0x00);
    writeCRAMIndex(vdp, 16 + 1, 0x03); // red
    writeVRAM(vdp, 0x0000 + (0 << 5), makeTopLeftOnlyTile());

    // Place at Y=0 (display at line 1), X=0
    writeVRAM(vdp, 0x3f00 + 0, [0x00]);
    writeVRAM(vdp, 0x3f80 + 0 * 2, [0x00, 0x00]);

    // No zoom: only pixel at (0,1)
    let rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();
    const [er, eg, eb] = cramToRgb(0x03);
    expect(rgbAt(rgb!, 0, 1)).toEqual([er, eg, eb]);
    expect(rgbAt(rgb!, 1, 1)).toEqual([0, 0, 0]); // no horizontal doubling yet
    // Vertical: since only row 0 has pixel, row 2 should be empty when not zoomed
    expect(rgbAt(rgb!, 0, 2)).toEqual([0, 0, 0]);

    // Enable zoom (R1 bit0=1)
    setReg(vdp, 1, 0x41);
    rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    // With zoom, the single source pixel should cover a 2x2 area starting at (0,1)
    expect(rgbAt(rgb!, 0, 1)).toEqual([er, eg, eb]);
    expect(rgbAt(rgb!, 1, 1)).toEqual([er, eg, eb]);
    expect(rgbAt(rgb!, 0, 2)).toEqual([er, eg, eb]);
    expect(rgbAt(rgb!, 1, 2)).toEqual([er, eg, eb]);
  });
});
