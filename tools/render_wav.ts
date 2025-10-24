import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';

interface RenderOptions {
  romPath: string;
  biosPath: string | null;
  seconds: number;
  sampleRate: number;
  outPath: string;
}

const CPU_CLOCK_HZ = 3579545; // ~3.579545 MHz (NTSC)

const ensureDir = async (p: string): Promise<void> => {
  await fs.mkdir(p, { recursive: true });
};

const writeWav16Mono = async (outPath: string, samples: Int16Array, sampleRate: number): Promise<void> => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const riffSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;
  // RIFF header
  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(riffSize, o); o += 4;
  buf.write('WAVE', o); o += 4;
  // fmt chunk
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4; // PCM chunk size
  buf.writeUInt16LE(1, o); o += 2; // PCM format
  buf.writeUInt16LE(numChannels, o); o += 2;
  buf.writeUInt32LE(sampleRate, o); o += 4;
  buf.writeUInt32LE(byteRate, o); o += 4;
  buf.writeUInt16LE(blockAlign, o); o += 2;
  buf.writeUInt16LE(bitsPerSample, o); o += 2;
  // data chunk
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;
  // PCM data (little endian int16)
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i]!, o); o += 2;
  }
  await fs.writeFile(outPath, buf);
};

const render = async (opts: RenderOptions): Promise<{ rms: number; maxAbs: number; outPath: string; unmuted: boolean }> => {
  const rom = new Uint8Array((await fs.readFile(opts.romPath)).buffer);
  const bios = opts.biosPath ? new Uint8Array((await fs.readFile(opts.biosPath)).buffer) : null;
  const machine = createMachine({ cart: { rom }, bus: { allowCartRam: true, bios }, fastBlocks: false });
  const cpu = machine.getCPU();
  const vdp = machine.getVDP();
  const psg = machine.getPSG();
  const pad1 = machine.getController1();

  const totalSamples = Math.floor(opts.seconds * opts.sampleRate);
  const out = new Int16Array(totalSamples);

  // Fractional cycles accumulator so we can step an integer number of cycles each sample
  const cyclesPerSample = CPU_CLOCK_HZ / opts.sampleRate;
  let cyclesCarry = 0;

  let sumSquares = 0;
  let maxAbs = 0;

  // Optional input injection to advance title screens, etc.
  const pressAtMs = process.env.PRESS_MS ? parseInt(process.env.PRESS_MS, 10) : 500;
  const pressForMs = process.env.PRESS_DUR_MS ? parseInt(process.env.PRESS_DUR_MS, 10) : 500;
  const pressStartSample = Math.floor((pressAtMs / 1000) * opts.sampleRate);
  const pressEndSample = Math.floor(((pressAtMs + pressForMs) / 1000) * opts.sampleRate);

  let sawUnmute = false;

  for (let i = 0; i < totalSamples; i++) {
    // Inject a button press window to move past menus
    if (i === pressStartSample) pad1.setState({ button1: true });
    if (i === pressEndSample) pad1.setState({ button1: false });
    cyclesCarry += cyclesPerSample;
    const toRun = Math.floor(cyclesCarry);
    cyclesCarry -= toRun;

    // Run CPU and tick subsystems for the computed cycles for this audio sample
    let remaining = toRun;
    while (remaining > 0) {
      const { cycles } = cpu.stepOne();
      remaining -= cycles;
      vdp.tickCycles(cycles);
      psg.tickCycles(cycles);
      if (vdp.hasIRQ()) cpu.requestIRQ();
    }

    // Fetch mixed audio sample (signed int16)
    const s = psg.getSample() | 0;
    out[i] = s;

    if (!sawUnmute) {
      const vols = psg.getState().vols;
      if (vols.some((v) => (v & 0x0f) < 0x0f)) sawUnmute = true;
    }
    const a = Math.abs(s);
    if (a > maxAbs) maxAbs = a;
    sumSquares += s * s;
  }

  const rms = Math.sqrt(sumSquares / totalSamples) / 32768; // normalize 0..1

  const outDir = path.dirname(opts.outPath);
  await ensureDir(outDir);
  await writeWav16Mono(opts.outPath, out, opts.sampleRate);
  return { rms, maxAbs, outPath: opts.outPath, unmuted: sawUnmute };
};

async function main(): Promise<void> {
  const ROOT = process.cwd();
  const romEnv = process.env.SMS_ROM;
  if (!romEnv) { console.error('Set SMS_ROM to a ROM path'); process.exit(1); }
  const biosEnv = process.env.SMS_BIOS || null;
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 8;
  const sampleRate = process.env.SAMPLE_RATE ? parseInt(process.env.SAMPLE_RATE, 10) : 44100;
  const outEnv = process.env.OUT_WAV || 'out/psg_capture.wav';

  const romPath = path.isAbsolute(romEnv) ? romEnv : path.join(ROOT, romEnv);
  const biosPath = biosEnv ? (path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv)) : null;
  const outPath = path.isAbsolute(outEnv) ? outEnv : path.join(ROOT, outEnv);

  const { rms, maxAbs, outPath: saved, unmuted } = await render({ romPath, biosPath, seconds, sampleRate, outPath });
  console.log(`WAV written: ${saved}`);
  console.log(`RMS=${rms.toFixed(6)} (0..1 normalized), peak=${(maxAbs/32768).toFixed(6)}`);
  console.log(`PSG ever unmuted (any volume < 0xF): ${unmuted}`);
  // Simple heuristic verdict
  if (rms > 0.005) console.log('AUDIO: LIKELY PRESENT');
  else console.log('AUDIO: PROBABLY SILENT (very low RMS)');
}

main().catch((e)=>{ console.error(e?.stack || String(e)); process.exit(1); });
