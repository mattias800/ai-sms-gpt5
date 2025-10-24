#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';

const CPU_CLOCK_HZ = 3_579_545;

interface Row { t: number; pc: number; port: number; val: number; kind: 'latch-vol'|'latch-tone'|'latch-noise'|'data' }

const isPsgPort = (p: number): boolean => {
  const x = p & 0xff;
  if (x === 0x7f || x === 0x7d) return true;
  if ((x & 1) === 1 && x !== 0x3f && x !== 0xbf && x !== 0xf1) return true;
  return false;
};

async function main(): Promise<void> {
  const ROOT = process.cwd();
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 8.0;
  const biosEnv = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
  const romEnv = process.env.SMS_ROM || process.env.WONDERBOY_SMS_ROM || '';
  const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
  await fs.access(biosPath);

  const romPath = romEnv ? (path.isAbsolute(romEnv) ? romEnv : path.join(ROOT, romEnv)) : '';
  const hasRom = romPath ? await fs.access(romPath).then(()=>true).catch(()=>false) : false;

  const cartRom = hasRom ? new Uint8Array((await fs.readFile(romPath)).buffer) : new Uint8Array(0xC000);
  const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

  let steps = 0;
  const rows: Row[] = [];
  let lastLatchedReg = -1;

  const mach = createMachine({
    cart: { rom: cartRom },
    bus: { allowCartRam: true, bios },
    useManualInit: false,
    cpuDebugHooks: {
      onIOWrite: (port: number, val: number, pcAtWrite: number): void => {
        const p = port & 0xff;
        const b = val & 0xff;
        const t = steps / CPU_CLOCK_HZ;
        if (!isPsgPort(p)) return;
        if ((b & 0x80) !== 0) {
          const channel = (b >>> 5) & 0x03;
          const isVol = (b & 0x10) !== 0;
          if (isVol) { lastLatchedReg = (channel << 1) | 1; rows.push({ t, pc: pcAtWrite & 0xffff, port: p, val: b, kind: 'latch-vol' }); }
          else if (channel < 3) { lastLatchedReg = (channel << 1); rows.push({ t, pc: pcAtWrite & 0xffff, port: p, val: b, kind: 'latch-tone' }); }
          else { lastLatchedReg = 6; rows.push({ t, pc: pcAtWrite & 0xffff, port: p, val: b, kind: 'latch-noise' }); }
        } else {
          rows.push({ t, pc: pcAtWrite & 0xffff, port: p, val: b, kind: 'data' });
        }
      },
    },
  });

  const cpu = mach.getCPU();

  // Run for N seconds (CPU cycles)
  let cyclesLeft = Math.floor(seconds * CPU_CLOCK_HZ);
  while (cyclesLeft > 0) {
    const { cycles } = cpu.stepOne();
    steps += cycles;
    cyclesLeft -= cycles;
  }

  const outDir = path.join(ROOT, 'out');
  await fs.mkdir(outDir, { recursive: true });
  const outCsv = path.join(outDir, 'psg_bios_writes.csv');
  let csv = 't,pc,port,val,kind\n';
  for (const r of rows) csv += `${r.t.toFixed(6)},${r.pc.toString(16)},${r.port.toString(16)},${r.val.toString(16)},${r.kind}\n`;
  await fs.writeFile(outCsv, csv);

  const counts = rows.reduce((acc, r) => { acc[r.kind] = (acc[r.kind] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`Wrote ${outCsv} (total=${rows.length}) counts=${JSON.stringify(counts)}${hasRom?` ROM=${romPath}`:''}`);
}

main().catch(e => { console.error(e?.stack || String(e)); process.exit(1); });
