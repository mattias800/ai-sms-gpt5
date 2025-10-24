#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';
import { enableSMSInterrupts } from '../src/machine/sms_init.js';

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
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
};
const isNearWhite = (r: number, g: number, b: number): boolean => (r >= 220 && g >= 220 && b >= 220);

(async () => {
  const root = process.cwd();
  const romPath = process.env.WONDERBOY_SMS_ROM || join(root, 'wonderboy5.sms');
  const biosPath = process.env.SMS_BIOS_ROM || join(root, 'third_party/mame/roms/sms1/mpr-10052.rom');
  if (!existsSync(romPath)) { console.error('ROM missing'); process.exit(1); }
  const rom = new Uint8Array(readFileSync(romPath));
  const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;
  const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios } });
  enableSMSInterrupts(m.getCPU());

  const vdp = m.getVDP();
  const s0 = vdp.getState?.();
  const cpf = (s0?.cyclesPerLine ?? 228) * (s0?.linesPerFrame ?? 262);

  for (let i = 0; i < 120; i++) m.runCycles(cpf);
  const rgb = vdp.renderFrame?.();
  if (!rgb) { console.error('no frame'); process.exit(2); }

  const W = 256, H = 192;
  const freq = new Map<number, number>();
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i]!, g = rgb[i + 1]!, b = rgb[i + 2]!;
    const key = (r << 16) | (g << 8) | b;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  let modalKey = 0, modalCount = 0;
  for (const [k, c] of freq.entries()) if (c > modalCount) { modalCount = c; modalKey = k; }
  const modalR = (modalKey >>> 16) & 0xff, modalG = (modalKey >>> 8) & 0xff, modalB = modalKey & 0xff;
  const modalHSV = rgbToHsv(modalR, modalG, modalB);

  // Center patch 10x10
  const cx0 = Math.floor(W / 2) - 5, cy0 = Math.floor(H / 2) - 5;
  let whiteCount = 0, darkBlueCount = 0, otherCount = 0, bgCount = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const idx = ((cy0 + y) * W + (cx0 + x)) * 3;
      const r = rgb[idx]!, g = rgb[idx + 1]!, b = rgb[idx + 2]!;
      const hsv = rgbToHsv(r, g, b);
      if (r === modalR && g === modalG && b === modalB) { bgCount++; continue; }
      if (isNearWhite(r, g, b)) { whiteCount++; continue; }
      let dh = Math.abs(hsv.h - modalHSV.h); if (dh > 180) dh = 360 - dh;
      if (dh <= 20 && hsv.v < (modalHSV.v - 0.10)) { darkBlueCount++; continue; }
      otherCount++;
    }
  }

  console.log(JSON.stringify({ modalRGB: { r: modalR, g: modalG, b: modalB }, modalHSV, center: { whiteCount, darkBlueCount, otherCount, bgCount } }, null, 2));
})();
