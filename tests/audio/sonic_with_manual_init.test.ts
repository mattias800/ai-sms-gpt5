import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic with manual init', () => {
  it('runs Sonic with manual init to check if audio works', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      console.log('[manual_init_sonic] Skipping: ROM not found');
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);

    // Create machine with MANUAL INIT
    const m = createMachine({
      cart: { rom },
      useManualInit: true, // Use manual init, NOT BIOS
    });

    const cpu = m.getCPU();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const sampleRate = 44100;
    const samplesPerFrame = Math.floor(sampleRate / 60);
    const cyclesPerSample = Math.floor(cyclesPerFrame / samplesPerFrame);
    const frames = 120; // 2 seconds

    let cycleCount = 0;
    const samples: number[] = [];
    const psg = m.getPSG();
    
    // Run for 2 seconds and collect audio samples
    for (let frame = 0; frame < frames; frame++) {
      for (let i = 0; i < samplesPerFrame; i++) {
        m.runCycles(cyclesPerSample);
        cycleCount += cyclesPerSample;
        const sample = psg.getSample();
        samples.push(sample);
      }
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

    console.log(`[manual_init_sonic] After 2 seconds with MANUAL INIT:`);
    console.log(`  Total cycles: ${cycleCount}`);
    console.log(`  Audio samples: ${samples.length}`);
    console.log(`  Non-zero samples: ${nonZeroCount} (${((nonZeroCount / samples.length) * 100).toFixed(1)}%)`);
    console.log(`  Max amplitude: ${maxAmp}`);

    if (nonZeroCount > samples.length * 0.1) {
      console.log(`  ✓ AUDIO WORKING with manual init!`);
    } else {
      console.log(`  ❌ No audio with manual init`);
    }
  }, 120000);
});
