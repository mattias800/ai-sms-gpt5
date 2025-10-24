import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';
import { createWavWriter } from './src/util/wavWriter.js';

// Test if we can generate music by directly writing PSG frequencies during game execution
const testPSGDirectMusic = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();

  const sampleRate = 22050;
  const seconds = 5;
  const totalSamples = Math.floor(sampleRate * seconds);
  const CPU_CLOCK_HZ = 3_579_545;
  const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;

  const wav = createWavWriter(sampleRate);
  let carry = 0;

  // After 2 seconds, manually inject some musical frequencies to test PSG
  let musicInjected = false;

  console.log('Testing PSG with manual music injection...');

  for (let i = 0; i < totalSamples; i++) {
    carry += cyclesPerSample;
    let toRun = Math.floor(carry);
    carry -= toRun;

    const currentTime = i / sampleRate;

    // At 2 seconds, inject a C major chord directly to PSG
    if (!musicInjected && currentTime >= 2.0) {
      console.log('Injecting C major chord directly to PSG...');

      // Channel 0: C4 (~262 Hz) -> N = 3579545/(32*262) ≈ 427
      psg.write(0x80 | 11);  // Low 4 bits = 11
      psg.write(26);         // High 6 bits = 26, total = (26<<4)|11 = 427
      psg.write(0x90 | 8);   // Volume = 8 (audible)

      // Channel 1: E4 (~330 Hz) -> N ≈ 339
      psg.write(0xA0 | 3);   // Low 4 bits = 3
      psg.write(21);         // High 6 bits = 21, total = (21<<4)|3 = 339
      psg.write(0xB0 | 8);   // Volume = 8

      // Channel 2: G4 (~392 Hz) -> N ≈ 285
      psg.write(0xC0 | 13);  // Low 4 bits = 13
      psg.write(17);         // High 6 bits = 17, total = (17<<4)|13 = 285
      psg.write(0xD0 | 8);   // Volume = 8

      console.log('Manual frequencies injected - checking PSG state...');
      const state = psg.getState();
      console.log(`PSG after injection: Tones=[${state.tones.join(',')}] Vols=[${state.vols.join(',')}]`);

      musicInjected = true;
    }

    // Continue running the game CPU
    while (toRun > 0) {
      const { cycles } = cpu.stepOne();
      toRun -= cycles;
    }

    const sample = psg.getSample();
    wav.pushSample(sample);
  }

  // Save result
  const wavData = wav.finish();
  await fs.writeFile('out/psg_direct_music_test.wav', wavData);

  console.log('Generated WAV: out/psg_direct_music_test.wav');

  // Final analysis
  const finalState = psg.getState();
  console.log(`Final PSG state:`);
  console.log(`  Tones: [${finalState.tones.join(', ')}]`);
  console.log(`  Volumes: [${finalState.vols.join(', ')}]`);

  const hasProperMusic = finalState.tones.some(t => t > 100) && finalState.vols.some(v => v < 15);
  console.log(`\n${hasProperMusic ? '✅ SUCCESS' : '❌ FAILED'}: Direct PSG music injection ${hasProperMusic ? 'worked' : 'failed'}`);

  if (!hasProperMusic) {
    console.log('This indicates a fundamental issue with PSG data byte handling');
  }
};

testPSGDirectMusic().catch(console.error);