import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic with BIOS enabled', () => {
  it('runs Sonic with real BIOS to check if audio works', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');
    const biosPath = path.join(ROOT, './third_party/mame/roms/sms1/mpr-10052.rom');

    try {
      await fs.access(romPath);
      await fs.access(biosPath);
    } catch {
      console.log('[bios_sonic] Skipping: ROM or BIOS not found');
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

    // Create machine WITH BIOS
    const m = createMachine({
      cart: { rom },
      useManualInit: false, // Use BIOS instead of manual init
      bus: { bios }, // Provide BIOS data
    });

    const cpu = m.getCPU();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const sampleRate = 44100; // Standard audio sample rate
    const samplesPerFrame = Math.floor(sampleRate / 60);
    const cyclesPerSample = Math.floor(cyclesPerFrame / samplesPerFrame);
    const frames = 120; // 2 seconds

    let cycleCount = 0;
    const samples: number[] = [];
    const psg = m.getPSG();
    
    // Run for 2 seconds and collect audio samples
    for (let frame = 0; frame < frames; frame++) {
      // Interleave CPU cycles with audio sampling (matching web harness)
      for (let i = 0; i < samplesPerFrame; i++) {
        m.runCycles(cyclesPerSample);
        cycleCount += cyclesPerSample;
        // Collect audio sample
        const sample = psg.getSample();
        samples.push(sample);
      }
      // Run remaining cycles to complete the frame
      const leftover = cyclesPerFrame - cyclesPerSample * samplesPerFrame;
      if (leftover > 0) {
        m.runCycles(leftover);
        cycleCount += leftover;
      }
    }

    // Analyze audio
    let nonZeroCount = 0;
    let maxAmp = 0;
    for (const sample of samples) {
      if (sample !== 0) nonZeroCount++;
      maxAmp = Math.max(maxAmp, Math.abs(sample));
    }

    console.log(`[bios_sonic] After 0.5 seconds with BIOS:`);
    console.log(`  Total cycles: ${cycleCount}`);
    console.log(`  Audio samples: ${samples.length}`);
    console.log(`  Non-zero samples: ${nonZeroCount}`);
    console.log(`  Max amplitude: ${maxAmp}`);

    if (nonZeroCount > samples.length * 0.1) {
      console.log(`  ✓ AUDIO WORKING with BIOS!`);
    } else {
      console.log(`  ❌ No audio even with BIOS`);
    }
  }, 120000);
});
