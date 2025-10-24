#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';

const CPU_CLOCK_HZ = 3_579_545;

interface SampleRow {
  t: number; // seconds
  tones: [number, number, number];
  vols: [number, number, number, number];
  noiseMode: number;
  noiseShift: number;
}

const toneHz = (n: number): number => {
  const N = n & 0x3ff;
  if (N === 0) return 0;
  return CPU_CLOCK_HZ / (32 * N);
};

const approxEq = (a: number, b: number, rel = 0.03): boolean => {
  if (a === 0 && b === 0) return true;
  const d = Math.abs(a - b);
  return d / Math.max(1, Math.abs(b)) <= rel;
};

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 3.0;
  const sampleHz = process.env.SAMPLE_HZ ? parseInt(process.env.SAMPLE_HZ, 10) : 240; // ~every 4.17ms
  const biosEnv = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
  const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
  await fs.access(biosPath);

  // Output path
  const outDir = path.join(ROOT, 'out');
  await fs.mkdir(outDir, { recursive: true });
  const outCsv = path.join(outDir, 'psg_bios_timeline.csv');

  // Dummy ROM (48KB) so mapper is valid
  const dummyRom = new Uint8Array(0xC000);
  const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

  const mach = createMachine({ cart: { rom: dummyRom }, bus: { allowCartRam: true, bios }, useManualInit: false });
  const cpu = mach.getCPU();
  const vdp = mach.getVDP();
  const psg = mach.getPSG();

  const totalSamples = Math.floor(seconds * sampleHz);
  const cyclesPerSample = CPU_CLOCK_HZ / sampleHz;
  let carry = 0;
  const rows: SampleRow[] = [];

  for (let i = 0; i < totalSamples; i++) {
    carry += cyclesPerSample;
    let toRun = Math.floor(carry);
    carry -= toRun;
    while (toRun > 0) {
      const { cycles } = cpu.stepOne();
      toRun -= cycles;
    }
    const st = psg.getState();
    rows.push({
      t: i / sampleHz,
      tones: [st.tones[0] | 0, st.tones[1] | 0, st.tones[2] | 0],
      vols: [st.vols[0] | 0, st.vols[1] | 0, st.vols[2] | 0, st.vols[3] | 0],
      noiseMode: st.noise.mode | 0,
      noiseShift: st.noise.shift | 0,
    });
  }

  // Write CSV
  let csv = 't, tone0, tone1, tone2, vol0, vol1, vol2, vol3, noiseMode, noiseShift\n';
  for (const r of rows) {
    csv += `${r.t.toFixed(6)}, ${r.tones[0]}, ${r.tones[1]}, ${r.tones[2]}, ${r.vols[0]}, ${r.vols[1]}, ${r.vols[2]}, ${r.vols[3]}, ${r.noiseMode}, ${r.noiseShift}\n`;
  }
  await fs.writeFile(outCsv, csv);

  // Summarize stable segments where at least two tone channels are non-zero and volumes < 0xF
  type Segment = { t0: number; t1: number; f: number[] };
  const segs: Segment[] = [];
  const stableFrames = Math.max(1, Math.floor(0.12 * sampleHz)); // require ~120ms stability
  let startIdx = 0;
  const freqsAt = (i: number): number[] => {
    const r = rows[i]!;
    const volsOk = (c: number) => ((r.vols[c]! & 0x0f) < 0x0f);
    const fs: number[] = [];
    for (let ch = 0; ch < 3; ch++) {
      if (r.tones[ch]! > 0 && volsOk(ch)) fs.push(toneHz(r.tones[ch]!));
    }
    fs.sort((a, b) => a - b);
    return fs;
  };
  const similarF = (a: number[], b: number[]): boolean => {
    if (a.length === 0 && b.length === 0) return true;
    const L = Math.min(a.length, b.length, 3);
    if (L === 0) return false;
    for (let i = 0; i < L; i++) if (!approxEq(a[i]!, b[i]!)) return false;
    return true;
  };

  for (let i = 0; i < rows.length; i++) {
    const fa = freqsAt(startIdx);
    const fb = freqsAt(i);
    if (!similarF(fa, fb)) {
      // close previous segment if long enough
      if (i - startIdx >= stableFrames && fa.length >= 2) {
        segs.push({ t0: rows[startIdx]!.t, t1: rows[i-1]!.t, f: fa });
      }
      startIdx = i;
    }
  }
  // tail
  if (rows.length - startIdx >= stableFrames) {
    const fa = freqsAt(startIdx);
    if (fa.length >= 2) segs.push({ t0: rows[startIdx]!.t, t1: rows[rows.length-1]!.t, f: fa });
  }

  // Print summary
  console.log(`Wrote ${outCsv}`);
  console.log(`Stable segments (>=120ms, >=2 tones active): ${segs.length}`);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const fstr = s.f.map(f => `${f.toFixed(1)}Hz`).join(', ');
    console.log(`#${i+1}  ${s.t0.toFixed(3)}s..${s.t1.toFixed(3)}s  f=[${fstr}]`);
  }

  if (segs.length >= 2) {
    console.log('Two or more chord-like stable segments found.');
  } else {
    console.log('Did not find two stable chord-like segments (audio likely still off).');
  }
};

main().catch(e => { console.error(e?.stack || String(e)); process.exit(1); });