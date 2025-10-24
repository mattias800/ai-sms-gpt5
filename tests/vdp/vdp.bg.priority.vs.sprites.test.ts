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

// Helper to build a solid color tile with optional priority bit set
const writeSolidTile = (vdp: ReturnType<typeof createVDP>, tileNum: number, color: number) => {
  const base = tileNum * 32;
  for (let y = 0; y < 8; y++) {
    for (let p = 0; p < 4; p++) {
      let byte = 0;
      const bitVal = (color >> p) & 1;
      if (bitVal) byte = 0xff; // all pixels set
      writeVRAM(vdp, base + y * 4 + p, byte);
    }
  }
};

describe('BG priority masks sprite pixels', () => {
  let vdp: ReturnType<typeof createVDP>;
  beforeEach(() => {
    vdp = createVDP();
    setReg(vdp, 1, 0x40); // display enable
    setReg(vdp, 2, 0x0e); // name table 0x3800
    // Sprite size 8x8, no magnification
    setReg(vdp, 1, 0x40);
    vdp.getVRAM!().fill(0);
    // Palette: ensure BG color 1 and sprite color 1 are distinct
    // CRAM 1 = red, 17 = green
    const ctrl = 0xbf;
    const port = 0xbe;
    // Write CRAM index 1
    vdp.writePort(ctrl, 0x00);
    vdp.writePort(ctrl, 0xc3);
    vdp.writePort(ctrl, 1);
    vdp.writePort(ctrl, 0xc3);
    vdp.writePort(port, 0x03); // R=3
    // Write CRAM index 17 (sprite palette index 1 + 16)
    vdp.writePort(ctrl, 17);
    vdp.writePort(ctrl, 0xc3);
    vdp.writePort(port, 0x0c); // G=3

    // Build tiles
    writeSolidTile(vdp, 1, 1); // solid color 1

    const nameBase = (((( vdp.getRegister!(2) ?? 0) >> 1) & 7) << 11) >>> 0;
    // Place tile with priority bit set at top-left
    const idx = 0;
    writeVRAM(vdp, nameBase + idx, 1); // tile #1
    writeVRAM(vdp, nameBase + idx + 1, 0x10); // priority bit set

    // Sprite: place an 8x8 sprite at (0,0) with color 1 pattern
    // Fill sprite pattern 0 with solid color 1
    const spritePatBase = ((vdp.getRegister!(6) ?? 0) & 0x04) ? 0x2000 : 0x0000;
    for (let y = 0; y < 8; y++) {
      for (let p = 0; p < 4; p++) {
        const bitVal = (1 >> p) & 1;
        writeVRAM(vdp, spritePatBase + y * 4 + p, bitVal ? 0xff : 0x00);
      }
    }
    // SAT base from R5
    const satBase = (((vdp.getRegister!(5) ?? 0) & 0x7e) << 7) >>> 0;
    // Sprite 0 at Y=0 (displayed at 1), X=0, pattern 0
    writeVRAM(vdp, satBase + 0, 0x00);
    writeVRAM(vdp, satBase + 128 + 0 * 2, 0x00);
    writeVRAM(vdp, satBase + 128 + 0 * 2 + 1, 0x00);
  });

  it('suppresses sprite pixel where BG has priority and non-zero color', () => {
    const frame = vdp.renderFrame!();
    // Pixel at (0,0): BG has priority and color 1 (red); sprite would be green if drawn
    const o = (0 * 256 + 0) * 3;
    const r = frame[o] ?? 0;
    const g = frame[o + 1] ?? 0;
    const b = frame[o + 2] ?? 0;
    // Expect red (BG) not green (sprite)
    expect(r).toBeGreaterThan(g);
  });
});
