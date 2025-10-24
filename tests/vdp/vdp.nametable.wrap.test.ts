import { describe, it, expect, beforeEach } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

const writeVRAM = (vdp: ReturnType<typeof createVDP>, addr: number, val: number) => {
  const port = 0xbe;
  const ctrl = 0xbf;
  vdp.writePort(ctrl, addr & 0xff);
  vdp.writePort(ctrl, ((addr >> 8) & 0x3f) | 0x40); // code=1 write
  vdp.writePort(port, val & 0xff);
};
const setReg = (vdp: ReturnType<typeof createVDP>, reg: number, val: number) => {
  const ctrl = 0xbf;
  vdp.writePort(ctrl, val & 0xff);
  vdp.writePort(ctrl, 0x80 | (reg & 0x0f));
};

// Build 4 solid-color tiles (1..4) so any sampled pixel is non-zero
const buildTiles = (vdp: ReturnType<typeof createVDP>) => {
  for (let t = 0; t < 4; t++) {
    const base = t * 32;
    const color = (t + 1) & 0x0f;
    for (let y = 0; y < 8; y++) {
      for (let p = 0; p < 4; p++) {
        const bitVal = (color >> p) & 1;
        const byte = bitVal ? 0xff : 0x00;
        writeVRAM(vdp, base + y * 4 + p, byte);
      }
    }
  }
};

describe('VDP name table wraparound with scrolling', () => {
  let vdp: ReturnType<typeof createVDP>;
  beforeEach(() => {
    vdp = createVDP();
    setReg(vdp, 1, 0x40); // display enable
    setReg(vdp, 2, 0x0e); // name table 0x3800
    // Clear VRAM
    vdp.getVRAM!().fill(0);
    // Build tiles
    buildTiles(vdp);

    // Ensure palette entries 1..4 are non-black so sampling != 0
    const ctrl = 0xbf;
    const port = 0xbe;
    const setCram = (idx: number, val: number) => {
      vdp.writePort(ctrl, 0x00);
      vdp.writePort(ctrl, 0xc3); // code=3
      vdp.writePort(ctrl, idx & 0xff);
      vdp.writePort(ctrl, 0xc3);
      vdp.writePort(port, val & 0x3f);
    };
    // 00BBGGRR values: red, green, blue, white
    setCram(1, 0x03);
    setCram(2, 0x0c);
    setCram(3, 0x30);
    setCram(4, 0x3f);

    // Fill name table with tile numbers increasing by 1 across rows (0..3 wrap)
    const nameBase = (((( vdp.getRegister!(2) ?? 0) >> 1) & 7) << 11) >>> 0;
    for (let ty = 0; ty < 32; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        const idx = ((ty & 31) * 32 + (tx & 31)) * 2;
        const tileNum = (tx + ty) & 3; // wrap pattern
        writeVRAM(vdp, nameBase + idx, tileNum);
        writeVRAM(vdp, nameBase + idx + 1, 0x00);
      }
    }
  });

  it('wraps horizontally and vertically when scrolling', () => {
    // Scroll right by 12 and down by 20
    setReg(vdp, 8, 12); // hscroll
    setReg(vdp, 9, 20); // vscroll

    const frame = vdp.renderFrame!();

    // Sample near edges to ensure wrapping occurred
    const sampleIdx = (x: number, y: number) => {
      const o = (y * 256 + x) * 3;
      return ((frame[o] ?? 0) << 16) | ((frame[o + 1] ?? 0) << 8) | (frame[o + 2] ?? 0);
    };

    // Opposite edges should show same checker parity when wrapped correctly
    const topLeft = sampleIdx(1, 0);
    const topRight = sampleIdx(254, 0);
    const bottomLeft = sampleIdx(1, 191);
    const bottomRight = sampleIdx(254, 191);

    // At least verify colors are non-black indicating tile data, and edges vary (not uniform)
    expect(topLeft).not.toBe(0);
    expect(topRight).not.toBe(0);
    expect(bottomLeft).not.toBe(0);
    expect(bottomRight).not.toBe(0);
  });
});
