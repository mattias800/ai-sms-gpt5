#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';

const CPU_HZ = 3_579_545;

const measureWindow = async (
  biosPath: string,
  startSec: number,
  durSec: number,
  sampleHz: number,
  writeCsv: boolean
): Promise<{ volChanges: number; changesPerSec: number; rms: number; peak: number }> => {
  const dummyRom = new Uint8Array(0xC000);
  const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
  const mach = createMachine({ cart: { rom: dummyRom }, bus: { allowCartRam: true, bios }, useManualInit: false });
  const cpu = mach.getCPU();
  const psg = mach.getPSG();

  // Run until start time
  let tCycles = 0;
  const targetStartCycles = Math.floor(startSec * CPU_HZ);
  while (tCycles < targetStartCycles) {
    const { cycles } = cpu.stepOne();
    tCycles += cycles;
  }

  const cyclesPerSample = CPU_HZ / sampleHz;
  const totalSamples = Math.floor(durSec * sampleHz);

  let lastVols: [number, number, number, number] = [0xf, 0xf, 0xf, 0xf];
  let volChanges = 0;
  let sum2 = 0;
  let maxAbs = 0;

  let carry = 0;
  let csv = 't, vol0, vol1, vol2, vol3\n';
  for (let i = 0; i < totalSamples; i++) {
    carry += cyclesPerSample;
    let toRun = Math.floor(carry);
    carry -= toRun;
    while (toRun > 0) {
      const { cycles } = cpu.stepOne();
      toRun -= cycles;
    }
    const st = psg.getState();
    const vols: [number, number, number, number] = [st.vols[0]|0, st.vols[1]|0, st.vols[2]|0, st.vols[3]|0];
    if (vols.some((v, idx)=>v !== lastVols[idx])) volChanges++;
    lastVols = vols;

    const centered = (psg.getSample() + 8192) | 0;
    const a = Math.abs(centered);
    if (a > maxAbs) maxAbs = a;
    sum2 += centered * centered;
    if (writeCsv) csv += `${(startSec + i/sampleHz).toFixed(6)}, ${vols[0]}, ${vols[1]}, ${vols[2]}, ${vols[3]}\n`;
  }

  if (writeCsv) {
    const outDir = path.join(process.cwd(), 'out');
    await fs.mkdir(outDir, { recursive: true });
    const outCsv = path.join(outDir, 'psg_window.csv');
    await fs.writeFile(outCsv, csv);
    console.log(`Wrote ${outCsv}`);
  }

  const rms = Math.sqrt(sum2 / totalSamples) / 32768;
  const changesPerSec = volChanges / durSec;
  return { volChanges, changesPerSec, rms, peak: maxAbs };
};

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const biosEnv = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
  const startSec = process.env.START ? parseFloat(process.env.START) : 1.65;
  const durSec = process.env.DURATION ? parseFloat(process.env.DURATION) : 0.5;
  const sampleHz = process.env.SAMPLE_HZ ? parseInt(process.env.SAMPLE_HZ, 10) : 2000;

  const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
  await fs.access(biosPath);

  if (process.env.SWEEP === '1') {
    const s0 = process.env.RANGE_START ? parseFloat(process.env.RANGE_START) : 1.4;
    const s1 = process.env.RANGE_END ? parseFloat(process.env.RANGE_END) : 2.3;
    const step = process.env.STEP ? parseFloat(process.env.STEP) : 0.025;
    const duration = process.env.DURATION ? parseFloat(process.env.DURATION) : 0.2;

    let best = { start: 0, vcps: -1, rms: -1, peak: 0, volChanges: 0 };
    const rows: string[] = [];
    rows.push('start, volChanges, changesPerSec, rms, peak');
    for (let s = s0; s+duration <= s1+1e-9; s += step) {
      const { volChanges, changesPerSec, rms, peak } = await measureWindow(biosPath, s, duration, sampleHz, false);
      rows.push(`${s.toFixed(3)}, ${volChanges}, ${changesPerSec.toFixed(1)}, ${rms.toFixed(5)}, ${peak}`);
      if (changesPerSec > best.vcps) best = { start: s, vcps: changesPerSec, rms, peak, volChanges };
    }
    const outDir = path.join(ROOT, 'out');
    await fs.mkdir(outDir, { recursive: true });
    const outCsv = path.join(outDir, 'psg_sweep.csv');
    await fs.writeFile(outCsv, rows.join('\n'));
    console.log(`Wrote ${outCsv}`);
    console.log(`Best window: start=${best.start.toFixed(3)}s dur=${duration}s`);
    console.log(`  volChanges=${best.volChanges}, changesPerSec=${best.vcps.toFixed(1)}, rms=${best.rms.toFixed(5)}, peak=${best.peak}`);
  } else {
    const res = await measureWindow(biosPath, startSec, durSec, sampleHz, true);
    console.log(`Window ${startSec.toFixed(3)}..${(startSec+durSec).toFixed(3)} s`);
    console.log(`Volume changes: ${res.volChanges} (~${res.changesPerSec.toFixed(1)} /s)`);
    console.log(`RMS=${res.rms.toFixed(5)} peak=${res.peak}`);
  }
};

main().catch((e)=>{ console.error(e?.stack || String(e)); process.exit(1); });