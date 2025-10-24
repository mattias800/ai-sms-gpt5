#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';
import { enableSMSInterrupts } from '../src/machine/sms_init.js';

const getPixelInfo = (st: any, x: number, y: number) => {
  const regs: number[] = st.regs;
  const nameBase = (((regs[2] ?? 0) >> 1) & 0x07) << 11;
  const patternBase = ((regs[4] ?? 0) & 0x04) ? 0x2000 : 0x0000;
  const hScrollGlobal = regs[8] ?? 0;
  const vScroll = regs[9] ?? 0;
  const scrolledY = (y + vScroll) & 0xff;
  const scrolledX = (x - hScrollGlobal) & 0xff;
  const tileY = scrolledY >> 3;
  const tileX = scrolledX >> 3;
  const pixelY = scrolledY & 7;
  const pixelX = scrolledX & 7;
  const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
  const nameAddr = (nameBase + nameIdx * 2) & 0x3fff;
  const low = st.vram[nameAddr] ?? 0;
  const high = st.vram[nameAddr + 1] ?? 0;
  const tileNum = low | ((high & 1) << 8);
  const hFlip = (high & 0x02) !== 0;
  const vFlip = (high & 0x04) !== 0;
  const sx = hFlip ? 7 - pixelX : pixelX;
  const sy = vFlip ? 7 - pixelY : pixelY;
  const tileAddr = (patternBase + ((tileNum & 0x3ff) << 5) + sy * 4) & 0x3fff;
  const bit = 7 - sx;
  const b0 = st.vram[tileAddr] ?? 0;
  const b1 = st.vram[tileAddr + 1] ?? 0;
  const b2 = st.vram[tileAddr + 2] ?? 0;
  const b3 = st.vram[tileAddr + 3] ?? 0;
  const colorIdx = ((b0 >> bit) & 1) | (((b1 >> bit) & 1) << 1) | (((b2 >> bit) & 1) << 2) | (((b3 >> bit) & 1) << 3);
  return { nameBase, tileX, tileY, nameAddr, low, high, tileNum, hFlip, vFlip, patternBase, tileAddr, colorIdx };
};

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
  const st = vdp.getState?.();
  if (!st) { console.error('no vdp state'); process.exit(2); }
  const center = getPixelInfo(st, 128, 96);
  console.log(JSON.stringify(center, null, 2));
})();
