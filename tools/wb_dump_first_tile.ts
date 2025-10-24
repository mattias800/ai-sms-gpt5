#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';
import { enableSMSInterrupts } from '../src/machine/sms_init.js';

const dumpTile = (vram: Uint8Array, base: number, tileNum: number): string[] => {
  const lines: string[] = [];
  const addr = base + ((tileNum & 0x3ff) << 5);
  for (let y = 0; y < 8; y++) {
    const row = addr + y * 4;
    const b0 = vram[row] ?? 0, b1 = vram[row + 1] ?? 0, b2 = vram[row + 2] ?? 0, b3 = vram[row + 3] ?? 0;
    let s = '';
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;
      const idx = ((b0 >> bit) & 1) | (((b1 >> bit) & 1) << 1) | (((b2 >> bit) & 1) << 2) | (((b3 >> bit) & 1) << 3);
      s += idx ? idx.toString(16) : '.';
    }
    lines.push(s);
  }
  return lines;
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
  const r2 = st.regs[2] ?? 0;
  const nameBase = ((r2 >> 1) & 7) << 11;
  const firstEntryLow = st.vram[nameBase] ?? 0;
  const firstEntryHigh = st.vram[nameBase + 1] ?? 0;
  const tileNum = firstEntryLow | ((firstEntryHigh & 1) << 8);
  const patternBase = ((st.regs[4] ?? 0) & 0x04) ? 0x2000 : 0x0000;

  const lines = dumpTile(new Uint8Array(st.vram), patternBase, tileNum);
  console.log(JSON.stringify({ nameBase: nameBase.toString(16), firstTile: tileNum, patternBase: patternBase.toString(16), tilePreview: lines }, null, 2));
})();
