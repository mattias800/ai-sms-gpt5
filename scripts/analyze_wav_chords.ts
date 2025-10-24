#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';

interface WavPCM {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Int16Array; // mono 16-bit
}

const readLE32 = (dv: DataView, off: number): number => dv.getUint32(off, true) >>> 0;
const readLE16 = (dv: DataView, off: number): number => dv.getUint16(off, true) >>> 0;

const decodeWav = async (filePath: string): Promise<WavPCM> => {
  const buf = new Uint8Array((await fs.readFile(filePath)).buffer);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // RIFF header
  const riff = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!);
  const wave = String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!);
  if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('Not a RIFF/WAVE file');

  let off = 12;
  let fmtFound = false;
  let dataFound = false;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let pcmData = new Int16Array(0);

  while (off + 8 <= buf.length) {
    const id = String.fromCharCode(buf[off]!, buf[off+1]!, buf[off+2]!, buf[off+3]!);
    const size = readLE32(dv, off + 4);
    const bodyOff = off + 8;
    if (id === 'fmt ') {
      fmtFound = true;
      const audioFormat = readLE16(dv, bodyOff + 0); // 1=PCM
      channels = readLE16(dv, bodyOff + 2);
      sampleRate = readLE32(dv, bodyOff + 4);
      // const byteRate = readLE32(dv, bodyOff + 8);
      const blockAlign = readLE16(dv, bodyOff + 12); // eslint-disable-line @typescript-eslint/no-unused-vars
      bitsPerSample = readLE16(dv, bodyOff + 14);
      if (audioFormat !== 1) throw new Error('Only PCM supported');
      if (channels !== 1) throw new Error('Mono expected');
      if (bitsPerSample !== 16) throw new Error('16-bit expected');
    } else if (id === 'data') {
      dataFound = true;
      const bytes = buf.subarray(bodyOff, bodyOff + size);
      if (bytes.byteLength % 2 !== 0) throw new Error('Odd data size for 16-bit PCM');
      pcmData = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    }
    off = bodyOff + size + (size & 1); // chunks are padded to even length
  }

  if (!fmtFound || !dataFound) throw new Error('fmt or data chunk missing');
  return { sampleRate, channels, bitsPerSample, data: pcmData };
};

const hannWindow = (n: number): Float64Array => {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
};

const goertzelPower = (x: Int16Array, i0: number, i1: number, sr: number, f0: number, win: Float64Array): number => {
  const N = i1 - i0;
  if (N <= 0) return 0;
  const k = Math.round((N * f0) / sr);
  const w = (2 * Math.PI * k) / N;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < N; i++) {
    const xi = (x[i0 + i] | 0) / 32768;
    const winx = xi * win[i]!;
    s0 = winx + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return power;
};

interface Peak { f: number; p: number }

const findTopPeaks = (powers: number[], freqs: number[], topK: number): Peak[] => {
  const pairs: Peak[] = powers.map((p, i) => ({ f: freqs[i]!, p }));
  pairs.sort((a, b) => b.p - a.p);
  return pairs.slice(0, topK);
};

const distinctRatio = (a: number[], b: number[]): number => {
  const L = Math.min(a.length, b.length, 3);
  let diff = 0;
  for (let i = 0; i < L; i++) {
    diff = Math.max(diff, Math.abs(a[i]! - b[i]!) / Math.max(1, b[i]!));
  }
  return diff;
};

const formatHz = (v: number): string => `${v.toFixed(1)}Hz`;

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const fileArgIdx = process.argv.indexOf('--file');
  const fileArg = fileArgIdx >= 0 ? process.argv[fileArgIdx + 1] : 'out/sms_bios_jingle.wav';
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT, fileArg);

  const wav = await decodeWav(filePath);
  console.log(`Analyzing: ${filePath}  sr=${wav.sampleRate}Hz  len=${wav.data.length} samples`);

  // Analysis params
  const targetMinHz = 200;
  const targetMaxHz = 3000;
  const stepHz = 10; // coarse grid
  const windowSize = (() => {
    const approxMs = 92; // ~92ms window at 44.1kHz => ~4096 samples
    const n = Math.pow(2, Math.round(Math.log2((wav.sampleRate * approxMs) / 1000)));
    return Math.max(1024, Math.min(8192, n));
  })();
  const hop = Math.floor(windowSize / 2);
  const win = hannWindow(windowSize);

  // Build frequency grid
  const freqs: number[] = [];
  for (let f = targetMinHz; f <= targetMaxHz; f += stepHz) freqs.push(f);

  type WindowReport = { tStart: number; tEnd: number; peaks: Peak[] };
  const reports: WindowReport[] = [];

  for (let i0 = 0; i0 + windowSize <= wav.data.length; i0 += hop) {
    const i1 = i0 + windowSize;
    const t0 = i0 / wav.sampleRate;
    const t1 = i1 / wav.sampleRate;
    const powers: number[] = new Array(freqs.length);
    for (let i = 0; i < freqs.length; i++) {
      powers[i] = goertzelPower(wav.data, i0, i1, wav.sampleRate, freqs[i]!, win);
    }
    const peaks = findTopPeaks(powers, freqs, 3);
    peaks.sort((a, b) => a.f - b.f);
    reports.push({ tStart: t0, tEnd: t1, peaks });
  }

  // Post-process: group into chord segments when peak sets are stable
  interface Segment { start: number; end: number; freqs: number[] }
  const segments: Segment[] = [];
  const ratioThresh = 0.06; // 6% change => new segment
  for (const r of reports) {
    const fset = r.peaks.map(p => p.f);
    if (segments.length === 0) {
      segments.push({ start: r.tStart, end: r.tEnd, freqs: fset });
      continue;
    }
    const last = segments[segments.length - 1]!;
    const diff = distinctRatio(fset, last.freqs);
    if (diff > ratioThresh) {
      segments.push({ start: r.tStart, end: r.tEnd, freqs: fset });
    } else {
      last.end = r.tEnd;
      // Blend/median could be added; keep last.freqs as-is for now
    }
  }

  // Merge very short segments (<60ms)
  const merged: Segment[] = [];
  for (const s of segments) {
    const dur = s.end - s.start;
    if (merged.length === 0) { merged.push(s); continue; }
    if (dur < 0.06) { merged[merged.length - 1]!.end = s.end; continue; }
    merged.push(s);
  }

  // Print summary
  console.log(`Segments detected: ${merged.length}`);
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i]!;
    console.log(`#${i+1}  ${s.start.toFixed(3)}s..${s.end.toFixed(3)}s  freqs=[${s.freqs.map(formatHz).join(', ')}]`);
  }

  // Heuristic: are there at least two segments with clearly different peak-sets?
  let distinctPairs = 0;
  for (let i = 1; i < merged.length; i++) {
    const d = distinctRatio(merged[i]!.freqs, merged[i-1]!.freqs);
    if (d > 0.08) distinctPairs++;
  }
  console.log(`Distinct transitions (diff>8%): ${distinctPairs}`);

  if (distinctPairs >= 1) {
    console.log('Potential two-chord structure detected.');
  } else {
    console.log('Two-chord structure not clearly detected (current audio may be off).');
  }
};

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });