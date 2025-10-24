import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const run = async (): Promise<void> => {
  const ROOT = process.cwd();
  const romPath = process.env.SMS_ROM || './sonic.sms';
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 23;
  const out = process.env.OUT || './tile_dump.txt';

  const romBytes = new Uint8Array(await (await fs.readFile(path.isAbsolute(romPath) ? romPath : path.join(ROOT, romPath))).buffer);
  const cart: Cartridge = { rom: romBytes };
  const machine = createMachine({ cart });
  const vdp = machine.getVDP();

  // Timing from our VDP defaults
  const cyclesPerLine = vdp.getState!().cyclesPerLine;
  const linesPerFrame = vdp.getState!().linesPerFrame;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;
  const frames = Math.floor(60 * seconds);

  for (let f = 0; f < frames; f++) machine.runCycles(cyclesPerFrame);

  const st = vdp.getState!();
  const vram = new Uint8Array(st.vram);
  const regs = st.regs;
  const nameBase = (((regs[2] ?? 0) >> 1) & 0x07) << 11;

  const lines: string[] = [];
  lines.push(`time=${seconds}s frames=${frames} nameBase=0x${nameBase.toString(16)} R4=0x${(regs[4]??0).toString(16)}`);

  const gridY = [0, 4, 8, 12, 16, 20, 22]; // sample some rows
  const gridX = [0, 4, 8, 12, 16, 20, 24, 28];

  const readTileNum = (tx: number, ty: number): number => {
    const idx = ((ty & 31) * 32 + (tx & 31)) * 2;
    const lo = vram[(nameBase + idx) & 0x3fff] ?? 0;
    const hi = vram[(nameBase + idx + 1) & 0x3fff] ?? 0;
    return (lo | ((hi & 0x01) << 8)) & 0x1ff;
  };

  const dumpTileBytes = (tileNum: number): string => {
    const base = (tileNum * 32) & 0x3fff;
    const row0 = Array.from({ length: 4 }, (_, i) => vram[(base + i) & 0x3fff] ?? 0);
    const row1 = Array.from({ length: 4 }, (_, i) => vram[(base + 4 + i) & 0x3fff] ?? 0);
    return `r0=${row0.map(b=>b.toString(16).padStart(2,'0')).join(' ')} r1=${row1.map(b=>b.toString(16).padStart(2,'0')).join(' ')}`;
  };

  lines.push('Grid tile numbers (tx,ty -> tile# hex first 2 rows bytes):');
  for (const ty of gridY) {
    const row: string[] = [];
    for (const tx of gridX) {
      const tn = readTileNum(tx, ty);
      row.push(`${tn.toString(16).padStart(3,'0')}(${dumpTileBytes(tn)})`);
    }
    lines.push(`[ty=${ty}] ${row.join('  |  ')}`);
  }

  await fs.writeFile(out, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${out}`);
};

run().catch(e => { console.error(e?.stack || String(e)); process.exit(1); });
