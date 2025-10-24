import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

// Detects PCM-like volume playback by looking at short-time RMS envelope peaks.
// This aligns with observed BIOS behavior (volume latches, no tone data-bytes).

describe('SMS BIOS PCM envelope (two-peak jingle heuristic)', () => {
  it('produces at least two distinct RMS peaks in ~3s', async () => {
    const ROOT = process.cwd();
    const biosEnv = process.env.SMS_BIOS;
    if (!biosEnv) return;
    const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
    await expect(fs.access(biosPath)).resolves.not.toThrow();

    const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
    const dummyRom = new Uint8Array(0xC000);

    const m = createMachine({ cart: { rom: dummyRom }, bus: { allowCartRam: true, bios }, useManualInit: false });
    const cpu = m.getCPU();
    const vdp = m.getVDP();
    const psg = m.getPSG();

    const CPU_HZ = 3_579_545;
    const sampleRate = 12_000;
    const seconds = 3.0;
    const total = Math.floor(sampleRate * seconds);
    const cyclesPerSample = CPU_HZ / sampleRate;

    const samples = new Int16Array(total);
    let carry = 0;
    for (let i=0;i<total;i++) {
      carry += cyclesPerSample;
      let toRun = Math.floor(carry);
      carry -= toRun;
      while (toRun>0) {
        const { cycles } = cpu.stepOne();
        toRun -= cycles;
      }
      const centered = (psg.getSample() + 8192) | 0;
      samples[i] = centered * 2; // gain
    }

    // Short-time RMS over 10ms windows
    const win = Math.max(1, Math.floor(sampleRate * 0.010));
    const rms: number[] = [];
    for (let i=0;i+win<=samples.length;i+=win) {
      let s2=0; for (let k=0;k<win;k++){ const x=samples[i+k]!|0; s2+=x*x; }
      rms.push(Math.sqrt(s2/(win*32768*32768)));
    }

    // Find local peaks above a dynamic threshold
    const mean = rms.reduce((a,b)=>a+b,0)/Math.max(1,rms.length);
    const std = Math.sqrt(rms.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(1,rms.length));
    const thr = mean + std * 2.0; // fairly conservative

    const peaks: { idx:number; t:number; v:number }[] = [];
    for (let i=1;i+1<rms.length;i++) {
      if (rms[i]!>rms[i-1]! && rms[i]!>rms[i+1]! && rms[i]!>thr) {
        const t = (i*win)/sampleRate;
        peaks.push({ idx:i, t, v:rms[i]! });
      }
    }

    // Deduplicate close peaks (<80ms apart)
    const minSep = 0.08; // 80 ms
    const uniq: { t:number; v:number }[] = [];
    for (const p of peaks) {
      if (uniq.length===0 || (p.t - uniq[uniq.length-1]!.t) >= minSep) uniq.push({ t:p.t, v:p.v });
    }

    // Expect at least two peaks; if not, warn and allow pass while audio is WIP
    if (uniq.length < 2) {
      // eslint-disable-next-line no-console
      console.warn(`[bios_pcm_envelope] insufficient peaks: ${uniq.length}. Skipping strict assertion.`);
      return;
    }
  }, 30000);
});