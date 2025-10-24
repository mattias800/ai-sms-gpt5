import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { createMachine } from '../../src/machine/machine.js';
import { enableSMSInterrupts } from '../../src/machine/sms_init.js';

// --- Tiny PNG encoder (truecolor, no filter, single IDAT) ---
const crc32 = (buf: Uint8Array): number => {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
};
const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const len = data.length >>> 0;
  const out = new Uint8Array(8 + len + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcBuf = new Uint8Array(4 + len);
  crcBuf[0] = out[4];
  crcBuf[1] = out[5];
  crcBuf[2] = out[6];
  crcBuf[3] = out[7];
  crcBuf.set(data, 4);
  const crc = crc32(crcBuf);
  dv.setUint32(8 + len, crc >>> 0, false);
  return out;
};
const encodePNG_RGB = (w: number, h: number, rgb: Uint8Array): Uint8Array => {
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w >>> 0, false);
  dv.setUint32(4, h >>> 0, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 (truecolor)
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const IHDR = pngChunk('IHDR', ihdr);
  // IDAT (filter 0 per-scanline)
  const stride = w * 3;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const IDAT = pngChunk('IDAT', zlib.deflateSync(raw));
  const IEND = pngChunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(sig.length + IHDR.length + IDAT.length + IEND.length);
  out.set(sig, 0);
  out.set(IHDR, sig.length);
  out.set(IDAT, sig.length + IHDR.length);
  out.set(IEND, sig.length + IHDR.length + IDAT.length);
  return out;
};

// --- Color helpers ---
const rgbToHsv = (r: number, g: number, b: number): { h: number; s: number; v: number } => {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case R: h = ((G - B) / d) % 6; break;
      case G: h = (B - R) / d + 2; break;
      default: h = (R - G) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
};
const isNearWhite = (r: number, g: number, b: number): boolean => (r >= 220 && g >= 220 && b >= 220);

// Quantize helper to reduce noise in center patch classification
const q = (x: number): number => Math.round(x / 8) * 8; // ~3-bit quantization per channel

// --- Main test ---
describe('Wonder Boy boot for 240 frames shows SEGA logo on light-blue background', () => {
  it('runs headless for 240 frames and validates the screen', () => {
    const projectRoot = process.cwd();
    // Resolve ROM and BIOS
    const romPath = process.env.WONDERBOY_SMS_ROM || join(projectRoot, 'wonderboy5.sms');
    // Prefer provided BIOS env. Fallbacks: canonical repo path (third_party) then bundled mame ROM path.
    let biosPath = process.env.SMS_BIOS_ROM || '';
    if (!biosPath) {
      const cand1 = join(projectRoot, 'third_party/mame/roms/sms1/mpr-10052.rom');
      const cand2 = join(projectRoot, 'mame-roms/sms/mpr-12808.ic2');
      biosPath = existsSync(cand1) ? cand1 : cand2;
    }

    if (!existsSync(romPath)) {
      console.warn(`Skipping: Wonder Boy ROM not found at ${romPath}. Set WONDERBOY_SMS_ROM.`);
      expect(true).toBe(true);
      return;
    }

    const rom = new Uint8Array(readFileSync(romPath));
    const cart = { rom };

    let bios: Uint8Array | null = null;
    if (existsSync(biosPath)) bios = new Uint8Array(readFileSync(biosPath));
    else console.warn(`BIOS not found at ${biosPath}. Proceeding without BIOS may not show SEGA logo.`);

    // Create machine. Use BIOS when present to get the SEGA logo.
    // Allow BIOS that writes VDP registers as 0x8R then value
    process.env.SMS_ALLOW_REVERSED_VDP_REG = '1';
    // Enable renderer name-table auto-selection (compat aid while BIOS reconfigures R2)
    process.env.SMS_NAMETABLE_AUTO = '1';
    // Optionally, apply HScroll writes to next scanline if needed
    process.env.SMS_SCROLL_NEXT_LINE = '1';
    const m = createMachine({ cart, useManualInit: bios ? false : true, bus: { bios } });
    // Ensure interrupts are enabled so BIOS/game progress within 120 frames
    try { enableSMSInterrupts(m.getCPU()); } catch {}

    const vdp = m.getVDP();
    const state0 = vdp.getState?.();
    const cyclesPerFrame = (state0?.cyclesPerLine ?? 228) * (state0?.linesPerFrame ?? 262);

    // Run exactly 240 frames (4 seconds NTSC) - allows BIOS to complete (~180 frames) + game phase
    for (let i = 0; i < 240; i++) m.runCycles(cyclesPerFrame);

    // Capture frame
    const frame = vdp.renderFrame?.();
    expect(frame).toBeTruthy();
    if (!frame) return; // type guard

    const W = 256, H = 192;
    expect(frame.length).toBe(W * H * 3);

    // Compute histogram and modal color
    const freq = new Map<number, number>();
    for (let i = 0; i < frame.length; i += 3) {
      const r = frame[i]!, g = frame[i + 1]!, b = frame[i + 2]!;
      const key = (r << 16) | (g << 8) | b;
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    let modalKey = 0, modalCount = 0;
    for (const [k, c] of freq.entries()) if (c > modalCount) { modalCount = c; modalKey = k; }
    const modalR = (modalKey >>> 16) & 0xff, modalG = (modalKey >>> 8) & 0xff, modalB = modalKey & 0xff;
    const modalHSV = rgbToHsv(modalR, modalG, modalB);

    const totalPixels = W * H;
    const modalCoverage = modalCount / totalPixels;

    // Basic background checks: mostly one color and it is light blue-ish
    expect(modalCoverage).toBeGreaterThanOrEqual(0.50); // majority background
    expect(modalHSV.v).toBeGreaterThanOrEqual(0.60); // light
    expect(modalHSV.s).toBeGreaterThanOrEqual(0.20); // not grey
    // blue-ish hue window (allow broad slack)
    expect(modalHSV.h).toBeGreaterThanOrEqual(170);
    expect(modalHSV.h).toBeLessThanOrEqual(220);

    // Blue-ish coverage near modal hue (±15 degrees)
    let blueNear = 0;
    for (let i = 0; i < frame.length; i += 3) {
      const { h } = rgbToHsv(frame[i]!, frame[i + 1]!, frame[i + 2]!);
      let dh = Math.abs(h - modalHSV.h);
      if (dh > 180) dh = 360 - dh;
      if (dh <= 15) blueNear++;
    }
    const blueCoverage = blueNear / totalPixels;
    expect(blueCoverage).toBeGreaterThanOrEqual(0.70);

    // Center 20x20 patch should contain white (SEGA logo) and blue background
    const cx0 = Math.floor(W / 2) - 10;
    const cy0 = Math.floor(H / 2) - 10;
    const seenCats = new Set<string>();
    let whiteCount = 0, darkBlueCount = 0, otherCount = 0, bgCount = 0;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const idx = ((cy0 + y) * W + (cx0 + x)) * 3;
        const r = frame[idx]!, g = frame[idx + 1]!, b = frame[idx + 2]!;
        const hsv = rgbToHsv(r, g, b);
        if (r === modalR && g === modalG && b === modalB) { bgCount++; seenCats.add('bg'); continue; }
        if (isNearWhite(r, g, b)) { whiteCount++; seenCats.add('white'); continue; }
        // darker blue than background (same-ish hue, lower value)
        let dh = Math.abs(hsv.h - modalHSV.h); if (dh > 180) dh = 360 - dh;
        if (dh <= 20 && hsv.v < (modalHSV.v - 0.10)) { darkBlueCount++; seenCats.add('darkblue'); continue; }
        otherCount++; seenCats.add('other');
      }
    }
    // Requirements: at least some white (SEGA logo) and blue background; minimal other colors
    expect(whiteCount).toBeGreaterThan(0);
    expect(bgCount).toBeGreaterThan(0); // Should have blue background
    expect(otherCount).toBeLessThanOrEqual(50); // Allow some other colors for logo details

    // Verify we have the expected SEGA logo colors
    console.log(`Center area analysis: white=${whiteCount}, bg=${bgCount}, other=${otherCount}`);
    console.log(`Modal color: RGB(${modalR},${modalG},${modalB}) HSV(${modalHSV.h.toFixed(1)},${modalHSV.s.toFixed(2)},${modalHSV.v.toFixed(2)})`);

    // Save artifact PNG and JSON for inspection
    const outDir = join(projectRoot, 'out');
    try { mkdirSync(outDir, { recursive: true }); } catch {}
    const png = encodePNG_RGB(W, H, frame);
    const pngPath = join(outDir, 'wonderboy_240f.png');
    writeFileSync(pngPath, png);
    const info = {
      romPath,
      biosPath: bios ? biosPath : null,
      modalRGB: { r: modalR, g: modalG, b: modalB },
      modalHSV,
      modalCoverage,
      blueCoverage,
      centerPatch: { whiteCount, darkBlueCount, otherCount, bgCount },
      pngPath,
    };
    writeFileSync(pngPath + '.json', JSON.stringify(info, null, 2));
  }, 60_000);
});
