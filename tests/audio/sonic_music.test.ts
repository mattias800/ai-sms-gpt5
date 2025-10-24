import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';
import { createWavWriter } from '../../src/util/wavWriter.js';
import { analyzeMusicFFTFromSamples } from '../../src/util/musicAnalysis.js';

// Test Sonic the Hedgehog music generation with proper BIOS initialization
// This runs BIOS first (3 seconds) then allows game to play music
describe('Sonic the Hedgehog music (with BIOS)', () => {
  it('generates musical audio after BIOS initialization sequence', async () => {
    const ROOT = process.cwd();
    const sonicPath = path.join(ROOT, 'sonic.sms');
    const biosPath = path.join(ROOT, 'bios13fx.sms');

    // Check if files exist
    try {
      await fs.access(sonicPath);
    } catch {
      console.warn('sonic.sms not found - skipping Sonic music test');
      return;
    }

    let bios: Uint8Array | undefined;
    try {
      bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
      console.log('Using BIOS for proper hardware initialization');
    } catch {
      console.warn('BIOS not found - running without BIOS initialization');
    }

    const rom = new Uint8Array((await fs.readFile(sonicPath)).buffer);
    const busConfig: { allowCartRam: boolean; bios?: Uint8Array | null } = { allowCartRam: true };
    if (bios !== undefined) {
      busConfig.bios = bios;
    }
    const m = createMachine({
      cart: { rom },
      bus: busConfig,
      useManualInit: false
    });
    const cpu = m.getCPU();
    const psg = m.getPSG();
    const controller1 = m.getController1();

    const sampleRate = 22050; // Lower sample rate for faster test
    const seconds = 20.0; // 20 seconds to get past BIOS + intro screens + wait for music
    const totalSamples = Math.floor(sampleRate * seconds);
    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;

    const samples = new Int16Array(totalSamples);
    const wav = createWavWriter(sampleRate);
    let carry = 0;

    // Track PSG state over time to detect musical activity
    type PSGSnapshot = { tones: number[], vols: number[], time: number };
    const psgHistory: PSGSnapshot[] = [];

    let startButtonPressed = false;

    for (let i = 0; i < totalSamples; i++) {
      carry += cyclesPerSample;
      let toRun = Math.floor(carry);
      carry -= toRun;

      // Simulate pressing Button 1 after 5 seconds to start the game
      const currentTime = i / sampleRate;
      if (!startButtonPressed && currentTime >= 5.0) {
        console.log(`Simulating Button 1 press at ${currentTime.toFixed(1)}s...`);
        controller1?.setState({ button1: true });
        startButtonPressed = true;
      }
      // Release Button 1 after 0.1 seconds
      if (startButtonPressed && currentTime >= 5.1) {
        controller1?.setState({ button1: false });
      }

      // Use machine.runCycles to ensure BIOS auto-disable logic executes
      m.runCycles(toRun);

      const sample = psg.getSample();
      samples[i] = sample;
      wav.pushSample(sample);

      // Record PSG state periodically (every ~50ms)
      if (i % Math.floor(sampleRate * 0.05) === 0) {
        const state = psg.getState();
        psgHistory.push({
          tones: [...state.tones],
          vols: [...state.vols],
          time: i / sampleRate
        });
      }
    }

    // Save WAV for analysis
    const wavData = wav.finish();
    await fs.writeFile(path.join(ROOT, 'out', 'sonic_bios_music_test.wav'), wavData);

    // Analyze audio output for musical characteristics
    console.log('Analyzing Sonic audio output (with BIOS initialization)...');

    // 1. Check for non-zero audio energy
    let sumSquared = 0;
    let maxAmplitude = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i] ?? 0;
      sumSquared += sample * sample;
      const abs = Math.abs(sample);
      if (abs > maxAmplitude) maxAmplitude = abs;
    }
    const rms = Math.sqrt(sumSquared / samples.length) / 32768;

    // 2. Check for frequency diversity in PSG
    const uniqueTones = new Set<string>();
    let activeToneCount = 0;
    let totalActiveSnapshots = 0;

    for (const snap of psgHistory) {
      let hasActiveTones = false;
      for (let ch = 0; ch < 3; ch++) {
        const vol = snap.vols[ch] ?? 15;
        const tone = snap.tones[ch] ?? 0;
        // More lenient check: any tone data or volume activity
        if (tone > 0) {
          uniqueTones.add(`${ch}:${tone}`);
        }
        if (vol < 15 && tone > 0) { // Volume < 15 is audible, tone > 0 is valid frequency
          activeToneCount++;
          hasActiveTones = true;
        }
      }
      if (hasActiveTones) totalActiveSnapshots++;
    }

    console.log(`Audio analysis:`);
    console.log(`  RMS level: ${rms.toFixed(6)}`);
    console.log(`  Max amplitude: ${maxAmplitude}`);
    console.log(`  Unique tone/channel combinations: ${uniqueTones.size}`);
    console.log(`  Active PSG snapshots: ${totalActiveSnapshots}/${psgHistory.length}`);
    console.log(`  Total active tone writes: ${activeToneCount}`);

    // Show timeline of PSG activity for debugging
    console.log('\nPSG Activity Timeline:');
    psgHistory.forEach((snap, i) => {
      const activeChans = snap.vols.map((v, ch) => v < 15 ? ch : -1).filter(ch => ch >= 0);
      const toneChans = snap.tones.map((t, ch) => t > 0 ? `${ch}:${t}` : null).filter(t => t);
      if (activeChans.length > 0 || toneChans.length > 0) {
        console.log(`  ${snap.time.toFixed(1)}s: Active volumes=[${activeChans.join(',')}] Tones=[${toneChans.join(',')}]`);
      }
    });

    // Check for basic audio system functionality
    expect(rms).toBeGreaterThan(0.001); // Should have some audio energy
    expect(maxAmplitude).toBeGreaterThan(1000); // Should have reasonable amplitude

    console.log('\n🎵 Checking for musical content...');

    // Musical-content verification using FFT peak detection (dominant spectral peak per frame -> MIDI)
    const analysis = analyzeMusicFFTFromSamples(samples, sampleRate, {
      windowSec: 0.05,       // 50ms windows for stable peak detection on square waves
      hopSec: 0.025,         // 50% overlap
      minHz: 100,            // ignore sub-bass/DC
      maxHz: 3500,           // PSG fundamentals within this band (harmonics above)
      minProminence: 6.0,    // dominant peak should be at least 6x mean magnitude within band
      minTonalRatio: 0.10,   // at least 10% frames tonal
      minUniqueNotes: 2,     // at least two distinct notes
      minNoteChanges: 1,     // at least one note change across time
    });
    console.log('Musical analysis:');
    console.log(`  Tonal ratio: ${(analysis.tonalRatio * 100).toFixed(1)}%`);
    console.log(`  Unique notes: ${analysis.uniqueNotes} [${analysis.uniqueMidis.join(', ')}]`);
    console.log(`  Note changes: ${analysis.noteChanges}`);
    console.log(`  Avg ACF peak: ${analysis.avgACFPeak.toFixed(3)}`);
    // Enforce musical content: fail the test if not musical
    expect(analysis.hasMusicalContent).toBe(true);
    if (uniqueTones.size === 0) {
      console.warn('⚠️  No PSG musical tones detected in this ROM/session');
      console.warn('This could indicate:');
      console.warn('  • This ROM variant has no music (common in some dumps)');
      console.warn('  • Game requires specific conditions to trigger audio');
      console.warn('  • Game uses FM audio instead of PSG');
      console.warn('  • Music appears later or requires different input sequence');

      // Verify audio system is functional by checking PSG activity
      const hasAnyPsgActivity = psgHistory.some(snap =>
        snap.vols.some(v => v < 15) || snap.tones.some(t => t > 0)
      );

      if (hasAnyPsgActivity) {
        console.log('✅ PSG hardware and I/O system are functional');
        console.log('✅ Test passed - audio system working, no musical content in this session');
      } else {
        console.error('❌ No PSG activity detected - potential hardware issue');
        expect(hasAnyPsgActivity).toBe(true);
      }
    } else if (totalActiveSnapshots === 0) {
      console.warn('⚠️  PSG tones detected but no audible output - volumes may be muted');
      console.log('✅ Test passed - PSG functional, volumes muted (expected for some ROMs)');
    } else {
      console.log(`✅ Musical content detected: ${uniqueTones.size} unique tones, ${totalActiveSnapshots} audible moments`);
      expect(uniqueTones.size).toBeGreaterThanOrEqual(1); // At least some musical activity
      expect(totalActiveSnapshots).toBeGreaterThan(0); // Should have audible moments
      console.log('✅ Sonic music test passed - BIOS+game sequence generates musical audio');
    }
  }, 60000); // 60 second timeout for 20-second game execution
});
