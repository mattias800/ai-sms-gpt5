#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';

const CPU_HZ = 3_579_545;

type Kind = 'latch-vol'|'latch-tone'|'latch-noise'|'data';

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const biosEnv = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
  const startSec = process.env.START ? parseFloat(process.env.START) : 1.60;
  const durSec = process.env.DURATION ? parseFloat(process.env.DURATION) : 0.50;

  const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
  await fs.access(biosPath);

  const dummyRom = new Uint8Array(0xC000);
  const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

  let cycles = 0;
  let inWindow = false;
  const tStart = Math.floor(startSec * CPU_HZ);
  const tEnd = Math.floor((startSec + durSec) * CPU_HZ);

  let total = 0;
  let byKind: Record<Kind, number> = { 'latch-vol':0, 'latch-tone':0, 'latch-noise':0, 'data':0 };
  let byPort = new Map<number, number>();

  const mach = createMachine({
    cart: { rom: dummyRom },
    bus: { allowCartRam: true, bios },
    useManualInit: false,
    cpuDebugHooks: {
      onIOWrite: (port: number, val: number, pcAtWrite: number): void => {
        void pcAtWrite;
        const p = port & 0xff;
        if (cycles < tStart || cycles > tEnd) return;
        // PSG likely on 0x7F (and sometimes 0x7D)
        if (p === 0x7f || p === 0x7d) {
          const b = val & 0xff;
          total++;
          const prev = byPort.get(p) || 0; byPort.set(p, prev+1);
          if ((b & 0x80) !== 0) {
            const channel = (b >>> 5) & 0x03;
            const isVol = (b & 0x10) !== 0;
            if (isVol) byKind['latch-vol']++; else if (channel < 3) byKind['latch-tone']++; else byKind['latch-noise']++;
          } else {
            byKind['data']++;
          }
        }
      },
    },
  });

  const cpu = mach.getCPU();

  // Run until end of window
  while (cycles < tEnd) {
    const { cycles: c } = cpu.stepOne();
    cycles += c;
  }

  console.log(`Window ${startSec.toFixed(3)}..${(startSec+durSec).toFixed(3)} s`);
  console.log(`PSG writes total=${total} kinds=${JSON.stringify(byKind)}`);
  if (byPort.size>0) {
    console.log('By port:');
    for (const [p, n] of Array.from(byPort.entries()).sort((a,b)=>b[1]-a[1])) {
      console.log(`  port=${p.toString(16).toUpperCase().padStart(2,'0')} count=${n}`);
    }
  } else {
    console.log('No PSG writes observed in window.');
  }
};

main().catch((e)=>{ console.error(e?.stack || String(e)); process.exit(1); });