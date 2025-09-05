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

// Tile with all pixels color 0
const makeTileColor0 = (): number[] => new Array(32).fill(0);

const rgbAt = (rgb: Uint8Array, x: number, y: number): [number, number, number] => {
  const off = (y * 256 + x) * 3;
  return [rgb[off], rgb[off + 1], rgb[off + 2]];
};

describe('VDP sprites: color index 0 is transparent', (): void => {
  it('drawing a fully transparent sprite leaves background unchanged', (): void => {
    const vdp = createVDP();
    setReg(vdp, 1, 0x40);
    setReg(vdp, 6, 0x00);

    // BG: set color 0 (CRAM[0]) to green so background pixels are green
    writeCRAMIndex(vdp, 0, 0x0c); // green

    // Sprite tile #0 all zeros (transparent)
    writeVRAM(vdp, 0x0000 + (0 << 5), makeTileColor0());

    // Sprite at (0,1)
    writeVRAM(vdp, 0x3f00 + 0, [0x00]); // Y=0 -> displayY=1
    writeVRAM(vdp, 0x3f80 + 0 * 2, [0x00, 0x00]);

    const rgb = vdp.renderFrame?.();
    expect(rgb).toBeTruthy();

    // Pixel (0,1) should be background (border color). In our renderer border fills entire screen.
    const [r, g, b] = rgbAt(rgb!, 0, 1);
    const [bgR, bgG, bgB] = [0, 85, 0]; // CRAM 0x0c -> green: R=0,G=170,B=0? Wait mapping is RR*85,GG*85,BB*85
    // Compute accurately:
    const g2 = ((0x0c >> 2) & 0x03) * 85; // 0x0c => GG=3 => 255, BB=0, RR=0
    expect([r, g, b]).toEqual([0, g2, 0]);
  });
});
