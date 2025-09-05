import { describe, it, expect, beforeEach } from 'vitest';
import { createVDP } from '../../src/vdp/vdp';

// Helper to set palette color to a distinct RGB value via CRAM index
const setColor = (vdp: ReturnType<typeof createVDP>, idx: number, r2: number, g2: number, b2: number) => {
  // Encode 2-bit components: 00BBGGRR
  const val = ((b2 & 3) << 4) | ((g2 & 3) << 2) | (r2 & 3);
  const port = 0xbe;
  const ctrl = 0xbf;
  // Set CRAM write: address with code=3
  vdp.writePort(ctrl, 0x00);
  vdp.writePort(ctrl, 0xc0 | 0x03); // code=3, addr high 0
  // point to CRAM idx
  vdp.writePort(ctrl, idx & 0xff);
  vdp.writePort(ctrl, 0xc0 | 0x03);
  vdp.writePort(port, val);
};

// Write VRAM at address
const writeVRAM = (vdp: ReturnType<typeof createVDP>, addr: number, val: number) => {
  const port = 0xbe;
  const ctrl = 0xbf;
  vdp.writePort(ctrl, addr & 0xff);
  vdp.writePort(ctrl, ((addr >> 8) & 0x3f) | 0x40); // code=1 write
  vdp.writePort(port, val & 0xff);
};

// Set register
const setReg = (vdp: ReturnType<typeof createVDP>, reg: number, val: number) => {
  const ctrl = 0xbf;
  vdp.writePort(ctrl, val & 0xff);
  vdp.writePort(ctrl, 0x80 | (reg & 0x0f));
};

describe('VDP Mode 4 tile flip rendering', () => {
  let vdp: ReturnType<typeof createVDP>;
  beforeEach(() => {
    vdp = createVDP();
    // Enable display
    setReg(vdp, 1, 0x40);
    // Name table at 0x3800 (R2 bits 3:1 = 0x7)
    setReg(vdp, 2, 0x0e);
    // Clear VRAM
    const vram = vdp.getVRAM!();
    vram.fill(0);
    // Palette: set BG indices 1..15 to non-black distinct values
    for (let i = 0; i < 16; i++) setColor(vdp, i, i & 3, (i >> 2) & 3, (i >> 4) & 3);
  });

  it('renders horizontal and vertical flips correctly', () => {
    const nameBase = (((vdp.getRegister!(2) >> 1) & 7) << 11) >>> 0;
    // Make a tile (#1) with a gradient so we can detect flipping
    // Row y has pixels x = y (diagonal) with color = (x+1)
    const tileNum = 1;
    const tileAddr = tileNum * 32;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;
        const color = (x === y) ? (y + 1) : 0;
        for (let p = 0; p < 4; p++) {
          const bitVal = (color >> p) & 1;
          const rowByteAddr = tileAddr + y * 4 + p;
          const prev = vdp.getVRAM!()[rowByteAddr];
          const next = bitVal ? (prev | (1 << bit)) : (prev & ~(1 << bit));
          writeVRAM(vdp, rowByteAddr, next);
        }
      }
    }

    // Place four tiles in name table: normal, H flip, V flip, HV flip
    const entries = [
      { x: 0, y: 0, attr: 0x00 }, // normal
      { x: 1, y: 0, attr: 0x02 }, // H flip
      { x: 0, y: 1, attr: 0x04 }, // V flip
      { x: 1, y: 1, attr: 0x06 }, // HV flip
    ];
    for (const e of entries) {
      const idx = (e.y * 32 + e.x) * 2;
      writeVRAM(vdp, nameBase + idx, tileNum & 0xff);
      writeVRAM(vdp, nameBase + idx + 1, ((tileNum >> 8) & 1) | e.attr);
    }

    const frame = vdp.renderFrame!();
    // Helper to read pixel color index from RGB by inverse palette
    const rgbToIdx = (o: number): number => {
      const r = frame[o];
      const g = frame[o + 1];
      const b = frame[o + 2];
      // Map back to 2-bit components
      const r2 = Math.round(r / 85) & 3;
      const g2 = Math.round(g / 85) & 3;
      const b2 = Math.round(b / 85) & 3;
      // Rebuild CRAM index by scanning 0..15 and matching RGB
      for (let i = 0; i < 16; i++) {
        const entry = vdp.getCRAM!()[i] & 0x3f;
        const rr = (entry & 3) * 85;
        const gg = ((entry >> 2) & 3) * 85;
        const bb = ((entry >> 4) & 3) * 85;
        if (rr === r && gg === g && bb === b) return i;
      }
      return 0;
    };

    // Sample the diagonal locations for each tile to check flipping
    const sample = (px: number, py: number) => rgbToIdx((py * 256 + px) * 3);

    // Normal tile at (0,0): diagonal pixel at (0,0) should be color 1
    expect(sample(0, 0)).toBe(1);
    // H flip at (8..15,0): diagonal at x=15 should be color 1
    expect(sample(15, 0)).toBe(1);
    // V flip at (0,8..15): diagonal at y=15 should be color 1
    expect(sample(0, 15)).toBe(1);
    // HV flip at (8..15,8..15): diagonal at (15,15)
    expect(sample(15, 15)).toBe(1);
  });
});
