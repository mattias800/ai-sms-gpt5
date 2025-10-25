import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('SMS BIOS silence verification', () => {
  it('renders BIOS audio to WAV and verifies complete silence (MAME sms BIOS)', async () => {
    const ROOT = process.cwd();
    // Use MAME sms BIOS by default, or SMS_BIOS env var for override
    const biosEnv = process.env.SMS_BIOS || './third_party/mame/roms/sms/mpr-12808.ic2';
    const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
    try {
      await fs.access(biosPath);
    } catch {
      console.log(`[bios_silence] Skipping: BIOS not found at ${biosPath}`);
      return;
    }
    const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
    const dummyRom = new Uint8Array(0xC000);

    const m = createMachine({ cart: { rom: dummyRom }, bus: { bios }, useManualInit: false });
    const cpu = m.getCPU();
    const psg = m.getPSG();

    // Render 3 seconds of BIOS audio at 44100 Hz
    const sampleRate = 44100;
    const seconds = 3;
    const totalSamples = sampleRate * seconds;
    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;

    const samples = new Int16Array(totalSamples);
    let carry = 0;

    // Sample PSG state periodically to inspect why audio isn't silent
    const stateSnapshots: Array<{ frame: number; state: any }> = [];

    for (let i = 0; i < totalSamples; i++) {
      carry += cyclesPerSample;
      let toRun = Math.floor(carry);
      carry -= toRun;
      while (toRun > 0) {
        const { cycles } = cpu.stepOne();
        toRun -= cycles;
      }
      // PSG returns signed sample in range [-8192, 8191]
      const s = psg.getSample();
      samples[i] = s;

      // Capture PSG state every 1000 samples
      if (i % 1000 === 0) {
        const st = psg.getState();
        stateSnapshots.push({ frame: i, state: st });
      }
    }

    // Log first few state snapshots
    if (stateSnapshots.length > 0) {
      console.log('[bios_silence] PSG state at sample milestones:');
      for (const snap of stateSnapshots.slice(0, 3)) {
        const st = snap.state;
        console.log(
          `  Sample ${snap.frame}: vols=[${st.vols.join(',')}] tones=[${st.tones.join(',')}] outputs=[${st.outputs.join(',')}] noise=${st.noiseOutput} noisevol=${st.vols[3]}`
        );
      }
    }

    // Build WAV file in memory
    const wavBuffer = buildWAV(samples, sampleRate);
    console.log(`[bios_silence] Generated WAV: ${wavBuffer.length} bytes (${totalSamples} samples at ${sampleRate}Hz)`);

    // Verify audio characteristics
    let nonZeroCount = 0;
    let maxAbs = 0;
    let sum2 = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] ?? 0;
      if (s !== 0) nonZeroCount++;
      const abs = Math.abs(s);
      if (abs > maxAbs) maxAbs = abs;
      sum2 += s * s;
    }
    const rms = Math.sqrt(sum2 / samples.length);

    console.log(`[bios_silence] Non-zero samples: ${nonZeroCount}/${totalSamples} (${(nonZeroCount/totalSamples*100).toFixed(1)}%)`);
    console.log(`[bios_silence] Max absolute sample value: ${maxAbs}`);
    console.log(`[bios_silence] RMS: ${rms.toFixed(2)}`);

    // The MAME sms BIOS is completely silent - it never writes to PSG ports.
    // This matches real hardware behavior verified with MAME emulator.
    // Expect all samples to be 0 and RMS to be 0.
    
    expect(nonZeroCount).toBe(0);
    console.log(`[bios_silence] ✓ All ${totalSamples} samples are silence (value=0)`);

    expect(rms).toBe(0);
    console.log(`[bios_silence] ✓ RMS power is 0 (complete silence)`);

    // Write WAV to artifacts for manual inspection if needed
    const artifactPath = path.join(ROOT, 'artifacts', 'bios_silence.wav');
    try {
      await fs.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.writeFile(artifactPath, wavBuffer);
      console.log(`[bios_silence] Wrote reference WAV to ${artifactPath}`);
    } catch (err) {
      console.warn(`[bios_silence] Could not write WAV artifact: ${(err as Error).message}`);
    }
  }, 30000);
});

/**
 * Build a minimal WAV file (RIFF format) in memory.
 * Returns a Uint8Array containing the complete WAV file.
 */
const buildWAV = (samples: Int16Array, sampleRate: number): Uint8Array => {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const dataSize = samples.length * bytesPerSample;

  // Calculate sizes for WAV header
  const headerSize = 44; // Standard WAV header is 44 bytes
  const fileSize = headerSize + dataSize - 8; // -8 because RIFF size doesn't include "RIFF" and size field itself

  const wav = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(wav);
  const bytes = new Uint8Array(wav);

  // Helper to write little-endian 32-bit integer
  const writeUint32 = (offset: number, value: number): void => {
    view.setUint32(offset, value, true);
  };

  // Helper to write little-endian 16-bit integer
  const writeUint16 = (offset: number, value: number): void => {
    view.setUint16(offset, value, true);
  };

  // RIFF header
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  writeUint32(4, fileSize);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt subchunk
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  writeUint32(16, 16); // subchunk1Size = 16 for PCM
  writeUint16(20, 1); // audioFormat = 1 (PCM)
  writeUint16(22, numChannels); // numChannels
  writeUint32(24, sampleRate); // sampleRate
  writeUint32(28, sampleRate * numChannels * bytesPerSample); // byteRate
  writeUint16(32, numChannels * bytesPerSample); // blockAlign
  writeUint16(34, 16); // bitsPerSample

  // data subchunk
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  writeUint32(40, dataSize);

  // Copy PCM samples as little-endian 16-bit signed integers
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    view.setInt16(offset, s, true);
    offset += 2;
  }

  return bytes;
};
