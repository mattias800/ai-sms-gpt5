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

// Make a sprite tile (32 bytes) where all pixels are color index 1 (non-zero)
const makeSpriteTileColor1 = (): number[] => {
  const out: number[] = [];
  // bitplanes: color 1 => b0=1s, others 0
  for (let y = 0; y < 8; y++) out.push(0xff, 0x00, 0x00, 0x00);
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

describe('VDP sprites: Y wrapping off-screen vs visible', (): void => {
  it('Y=0xFF should not wrap to top; sprite must be off-screen', (): void => {
    const vdp = createVDP();
    // Display on
    setReg(vdp, 1, 0x40);
    // Sprite patterns at 0x0000 (R6 bit2=0)
    setReg(vdp, 6, 0x00);
    // Background color index 0 (default), leave CRAM[0]=0 (black)
    setReg(vdp, 7, 0x00);

    // Sprite palette: set entry 16+1 (index 17) = bright red
    writeCRAMIndex(vdp, 16 + 1, 0x03);

    // Sprite tile #0: all pixels color 1
    writeVRAM(vdp, 0x0000 + (0 << 5), makeSpriteTileColor1());

    // Sprite attribute base defaults to 0x3F00 (R5=0xFF). Place sprite 0
    // Y = 0xFF (off-screen), X=0, pattern=0
    writeVRAM(vdp, 0x3f00 + 0, [0xff]); // Y
    writeVRAM(vdp, 0x3f80 + 0 * 2, [0x00, 0x00]); // X, pattern

    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    // Pixel (0,0) should remain background black (0,0,0), not sprite red
    const [r, g, b] = rgbAt(rgb!, 0, 0);
    expect([r, g, b]).toEqual([0, 0, 0]);
  });

  it('Y=0 should place sprite starting at display line 1 making pixels visible', (): void => {
    const vdp = createVDP();
    setReg(vdp, 1, 0x40);
    setReg(vdp, 6, 0x00);
    setReg(vdp, 7, 0x00);
    writeCRAMIndex(vdp, 16 + 1, 0x03); // sprite red
    writeVRAM(vdp, 0x0000 + (0 << 5), makeSpriteTileColor1());

    // Y=0x00 => displayY=1; X=0; pattern=0
    writeVRAM(vdp, 0x3f00 + 0, [0x00]); // Y
    writeVRAM(vdp, 0x3f80 + 0 * 2, [0x00, 0x00]); // X, pattern

    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    // Pixel (0,1) should be sprite red
    const [er, eg, eb] = cramToRgb(0x03);
    const [r, g, b] = rgbAt(rgb!, 0, 1);
    expect([r, g, b]).toEqual([er, eg, eb]);
  });
});
