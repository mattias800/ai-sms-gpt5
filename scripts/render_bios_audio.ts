#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import { createWavWriter } from '../src/util/wavWriter.js';

const CPU_CLOCK_HZ = 3_579_545; // SMS Z80 clock

const clamp = (v: number, lo: number, hi: number): number => v < lo ? lo : (v > hi ? hi : v);

const resolvePathIfExists = async (p: string | undefined | null): Promise<string | null> => {
  if (!p) return null;
  const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
  try { await fs.access(abs); return abs; } catch { return null; }
};

const main = async (): Promise<void> => {
  const env = process.env;
  const biosEnv = env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
  const romEnv = env.SMS_ROM || env.WONDERBOY_SMS_ROM || '';
  const outPath = env.OUT || 'out/sms_bios_jingle.wav';
  const frames = env.FRAMES ? parseInt(env.FRAMES, 10) : 180; // ~3s @60Hz
  const sampleRate = env.SAMPLE_RATE ? parseInt(env.SAMPLE_RATE, 10) : 44100;
  const gain = env.GAIN ? parseFloat(env.GAIN) : 4.0;

  const biosPath = await resolvePathIfExists(biosEnv);
  if (!biosPath) throw new Error(`BIOS not found at ${biosEnv}`);

  // Ensure output dir exists
  const outDir = path.dirname(outPath);
  await fs.mkdir(outDir, { recursive: true });

  // Load ROM if provided to trigger BIOS jingle path; fall back to dummy 48KB ROM
  const romPath = await resolvePathIfExists(romEnv);
  const cartRom = romPath ? new Uint8Array((await fs.readFile(romPath)).buffer) : new Uint8Array(0xC000);
  const biosBytes = new Uint8Array((await fs.readFile(biosPath)).buffer);

  const machine = createMachine({
    cart: { rom: cartRom } as Cartridge,
    bus: { allowCartRam: true, bios: biosBytes },
    useManualInit: false, // run the actual BIOS
  });

  const cpu = machine.getCPU();
  const vdp = machine.getVDP();
  const psg = machine.getPSG();

  // Determine cycles per frame from VDP state (fallback to NTSC constants)
  const st0 = vdp.getState?.();
  const cyclesPerFrame = ((st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262)) | 0;
  const totalCyclesTarget = (frames * cyclesPerFrame) | 0;

  // Sampling loop with fractional step carry
  const writer = createWavWriter(sampleRate);
  const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;
  let cyclesElapsed = 0;
  let carry = 0;

  while (cyclesElapsed < totalCyclesTarget) {
    const { cycles } = cpu.stepOne();
    cyclesElapsed += cycles;
    carry += cycles;

    // Emit one or more audio samples by integrating getSample over the sample period
    while (carry >= cyclesPerSample) {
      let sampleBudget = cyclesPerSample;
      carry -= cyclesPerSample;
      let acc = 0; // time-weighted sum of centered samples
      while (sampleBudget > 0) {
        const { cycles: c2 } = cpu.stepOne();
        // centered instantaneous sample
        const centered = (psg.getSample() + 8192) | 0;
        const take = c2 <= sampleBudget ? c2 : sampleBudget;
        acc += centered * take;
        sampleBudget -= take;
      }
      const avgCentered = acc / cyclesPerSample;
      const scaled = clamp(Math.round(avgCentered * gain), -32768, 32767);
      writer.pushSample(scaled);
    }
  }

  const wav = writer.finish();
  await fs.writeFile(outPath, wav);
  console.log(`Wrote ${outPath} (${writer.getSampleCount()} samples @ ${sampleRate} Hz) for ${frames} frames.`);
  console.log(`BIOS: ${biosPath}`);
  if (romPath) console.log(`ROM: ${romPath}`);
  else console.log('ROM: <none> (dummy). Hint: set SMS_ROM=/path/to/game.sms to trigger BIOS jingle.');
};

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
