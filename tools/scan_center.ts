#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';
import { enableSMSInterrupts } from '../src/machine/sms_init.js';

const getCenterInfo = (st: any) => {
  const regs: number[] = st.regs;
  const nameBase = (((regs[2] ?? 0) >> 1) & 0x07) << 11;
  const patternBase = ((regs[4] ?? 0) & 0x04) ? 0x2000 : 0x0000;
  const hScroll = regs[8] ?? 0;
  const vScroll = regs[9] ?? 0;
  // center
  const x = 128, y = 96;
  const scrolledY = (y + vScroll) & 0xff;
  const scrolledX = (x - hScroll) & 0xff;
  const tileY = scrolledY >> 3;
  const tileX = scrolledX >> 3;
  const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
  const nameAddr = (nameBase + nameIdx * 2) & 0x3fff;
  const low = st.vram[nameAddr] ?? 0;
  const high = st.vram[nameAddr + 1] ?? 0;
  const tileNum = low | ((high & 1) << 8);
  return { nameBase, patternBase, hScroll, vScroll, tileX, tileY, nameAddr, low, high, tileNum };
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
  const out: any[] = [];
  for (let f = 1; f <= 200; f++) {
    m.runCycles(cpf);
    const st = vdp.getState?.();
    if (!st) continue;
    const info = getCenterInfo(st);
    out.push({ f, ...info });
  }
  console.log(JSON.stringify(out, null, 2));
})();
