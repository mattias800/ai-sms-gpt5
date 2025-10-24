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

// Sprite tile: all pixels color index 1
const makeSpriteTileColor1 = (): number[] => {
  const out: number[] = [];
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

describe('VDP sprites: 8-per-scanline limit and SAT terminator', (): void => {
  it('enforces 8 sprites per scanline', (): void => {
    const vdp = createVDP();
    setReg(vdp, 1, 0x40); // display on
    setReg(vdp, 6, 0x00); // sprite patterns at 0x0000
    setReg(vdp, 5, 0x7e); // sprite attribute base 0x3f00
    writeCRAMIndex(vdp, 16 + 1, 0x03); // sprite palette index 1 = red
    writeVRAM(vdp, 0x0000 + (0 << 5), makeSpriteTileColor1()); // tile 0

    // Place 9 sprites on the same scanline (y=10), spaced 8 pixels apart
    const y = 9; // spriteY=9 => displayY=10
    for (let i = 0; i < 9; i++) {
      // Y entries start at 0x3f00 + i
      writeVRAM(vdp, 0x3f00 + i, [y & 0xff]);
      // X/pattern at 0x3f80 + i*2
      writeVRAM(vdp, 0x3f80 + i * 2, [i * 8, 0x00]); // X=i*8, pattern=0
    }

    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    const [er, eg, eb] = cramToRgb(0x03);
    // First 8 sprites should draw at x=0,8,16,...,56 on line 10; the 9th at x=64 should NOT draw
    for (let i = 0; i < 8; i++) {
      const [r, g, b] = rgbAt(rgb!, i * 8, 10);
      expect([r, g, b]).toEqual([er, eg, eb]);
    }
    const [r9, g9, b9] = rgbAt(rgb!, 64, 10);
    expect([r9, g9, b9]).toEqual([0, 0, 0]); // background
  });

  it('honors SAT terminator (Y=0xD0) and ignores subsequent entries', (): void => {
    const vdp = createVDP();
    setReg(vdp, 1, 0x40);
    setReg(vdp, 6, 0x00);
    setReg(vdp, 5, 0x7e);
    writeCRAMIndex(vdp, 16 + 1, 0x03); // sprite red
    writeVRAM(vdp, 0x0000 + (0 << 5), makeSpriteTileColor1());

    // Sprite 0..2 visible at y=10
    for (let i = 0; i < 3; i++) {
      writeVRAM(vdp, 0x3f00 + i, [0x09]); // Y=9 => displayY=10
      writeVRAM(vdp, 0x3f80 + i * 2, [i * 8, 0x00]);
    }
    // Sprite 3 is terminator
    writeVRAM(vdp, 0x3f00 + 3, [0xd0]);
    // Sprite 4 would otherwise be visible, but should be ignored due to terminator
    writeVRAM(vdp, 0x3f00 + 4, [0x09]);
    writeVRAM(vdp, 0x3f80 + 4 * 2, [32, 0x00]);

    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    const [er, eg, eb] = cramToRgb(0x03);
    // Sprites 0..2 drawn
    for (let i = 0; i < 3; i++) {
      const [r, g, b] = rgbAt(rgb!, i * 8, 10);
      expect([r, g, b]).toEqual([er, eg, eb]);
    }
    // Sprite 4 (x=32) should be ignored
    const [r4, g4, b4] = rgbAt(rgb!, 32, 10);
    expect([r4, g4, b4]).toEqual([0, 0, 0]);
  });
});
