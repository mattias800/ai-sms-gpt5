import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace PSG channel activity to see if all channels are being written and mixed
 */

const main = async () => {
  console.log('=== PSG CHANNEL TRACE ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const biosPath = './bios13fx.sms';
  let bios: Uint8Array | undefined;
  try {
    bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
  } catch {
    console.error('BIOS not found');
    process.exit(1);
  }

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false,
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();

  // Run 2 seconds worth of frames
  const FRAME_CYCLES = 228 * 262;
  const fps = 60;
  const targetFrames = fps * 2; // 2 seconds
  let cyclesExecuted = 0;

  console.log(`Running ${targetFrames} frames (~${targetFrames/fps} seconds)...\n`);

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  // Analyze final PSG state
  const psgState = psg.getState();
  console.log('=== FINAL PSG STATE ===\n');
  console.log(`Tones (10-bit):  [${psgState.tones.map(t => t.toString().padStart(3, ' ')).join(', ')}]`);
  console.log(`Volumes:         [${psgState.vols.map(v => v.toString().padStart(2, ' ')).join(', ')}]`);
  console.log(`Counters:        [${psgState.counters.map(c => c.toString().padStart(4, ' ')).join(', ')}]`);
  console.log(`Outputs:         [${psgState.outputs.map(o => o ? '1' : '0').join(', ')}]`);
  console.log(`Noise counter:   ${psgState.noiseCounter}`);
  console.log(`Noise output:    ${psgState.noiseOutput}`);

  // Calculate frequencies from tones
  console.log('\n=== FREQUENCY ANALYSIS ===\n');
  console.log('PSG clock: 3.579545 MHz / 16 = 223.72 kHz base clock');
  console.log('Frequency = (PSG clock / (2 * N)) where N = 10-bit tone value\n');

  const psgClock = 3579545 / 16; // 223722.8125 Hz
  for (let ch = 0; ch < 3; ch++) {
    const N = psgState.tones[ch] & 0x3ff;
    const vol = psgState.vols[ch];
    if (N > 0) {
      const freq = psgClock / (2 * N);
      // Convert to MIDI note number (A4 = 440 Hz, MIDI 69)
      const midiNote = 69 + 12 * Math.log2(freq / 440);
      const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor((midiNote + 12) / 12) - 1;
      const noteIdx = Math.round(midiNote) % 12;
      const note = noteName[noteIdx];
      console.log(`CH${ch}: N=${N.toString().padStart(3, '0')} → ${freq.toFixed(1)} Hz ≈ ${note}${octave} (MIDI ${Math.round(midiNote)}) - ${vol === 15 ? 'MUTED' : `VOL=${vol}`}`);
    } else {
      console.log(`CH${ch}: N=000 (silent/uninitialized) - ${vol === 15 ? 'MUTED' : `VOL=${vol}`}`);
    }
  }

  // Sample audio to see mixing
  console.log('\n=== AUDIO MIXING CHECK ===\n');
  let totalEnergy = 0;
  let channelEnergy = [0, 0, 0, 0];
  const samples = 44100; // 1 second at 44100 Hz

  for (let i = 0; i < samples; i++) {
    const s = psg.getSample();
    totalEnergy += s * s;
    // Rough approximation of which channel contributes (not precise)
    if (Math.abs(s) > 0) {
      channelEnergy[i % 4]++;
    }
  }

  const rms = Math.sqrt(totalEnergy / samples) / 32768;
  console.log(`Total RMS: ${rms.toFixed(6)}`);
  console.log(`Max possible RMS (one channel, full volume): ~${(8191 / 32768).toFixed(6)}`);
  console.log(`Expected with 3 channels in phase: ~${(3 * 8191 / 32768).toFixed(6)}`);
  
  if (rms < 0.001) {
    console.log('\n⚠️  Very quiet - check if channels are muted');
  } else if (rms < (8191 / 32768 * 0.5)) {
    console.log('\n⚠️  Quieter than expected - may only have 1-2 channels unmuted');
  } else {
    console.log('\n✅ Audio level reasonable for multiple channels');
  }

  // Check if tones are zero (uninitialized)
  console.log('\n=== TONE INITIALIZATION CHECK ===\n');
  const uninitializedChannels = psgState.tones.filter(t => (t & 0x3ff) === 0).length;
  if (uninitializedChannels === 3) {
    console.log('❌ All tone channels uninitialized (N=0)');
    console.log('This explains why you hear silence or white noise');
  } else if (uninitializedChannels > 0) {
    console.log(`⚠️  ${uninitializedChannels} uninitialized channel(s)`);
  } else {
    console.log('✅ All channels initialized with tone values');
  }
};

main().catch(console.error);
