import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace PSG channel activity with Sonic ROM
 */

const main = async () => {
  console.log('=== SONIC PSG CHANNEL TRACE ===\n');

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

  // Run for 300 frames (~5 seconds) to get past BIOS
  const FRAME_CYCLES = 228 * 262;
  const targetFrames = 300;
  let cyclesExecuted = 0;

  console.log(`Running ${targetFrames} frames to get past BIOS...\n`);

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  // Analyze final PSG state
  const psgState = psg.getState();
  console.log('=== SONIC PSG STATE (After BIOS) ===\n');
  console.log(`Tones (10-bit):  [${psgState.tones.map(t => t.toString().padStart(3, ' ')).join(', ')}]`);
  console.log(`Volumes:         [${psgState.vols.map(v => v.toString().padStart(2, ' ')).join(', ')}]`);
  console.log(`Outputs:         [${psgState.outputs.map(o => o ? '1' : '0').join(', ')}]`);

  // Calculate frequencies
  console.log('\n=== FREQUENCY ANALYSIS ===\n');
  const psgClock = 3579545 / 16;
  const activeChannels: { ch: number; freq: number; vol: number; note: string }[] = [];
  
  for (let ch = 0; ch < 3; ch++) {
    const N = psgState.tones[ch] & 0x3ff;
    const vol = psgState.vols[ch];
    if (N > 0 && vol < 15) {
      const freq = psgClock / (2 * N);
      const midiNote = 69 + 12 * Math.log2(freq / 440);
      const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const octave = Math.floor((midiNote + 12) / 12) - 1;
      const noteIdx = Math.round(midiNote) % 12;
      const note = `${noteName[noteIdx]}${octave}`;
      activeChannels.push({ ch, freq, vol, note });
      console.log(`CH${ch}: N=${N.toString().padStart(3, '0')} → ${freq.toFixed(1)} Hz = ${note} (VOL=${vol})`);
    }
  }

  if (activeChannels.length === 0) {
    console.log('No active channels (all muted or uninitialized)');
  } else if (activeChannels.length === 1) {
    console.log(`\n⚠️  Only 1 channel active - ${activeChannels[0].note}`);
    console.log('(This is monophonic, not a chord)');
  } else {
    console.log(`\n✅ ${activeChannels.length} channels active forming a chord:`);
    activeChannels.forEach(ch => console.log(`   CH${ch.ch}: ${ch.note}`));
  }

  // Sampling check
  console.log('\n=== AUDIO LEVEL ===\n');
  let totalEnergy = 0;
  const samples = 44100;
  for (let i = 0; i < samples; i++) {
    const s = psg.getSample();
    totalEnergy += s * s;
  }
  const rms = Math.sqrt(totalEnergy / samples) / 32768;
  console.log(`RMS: ${rms.toFixed(6)}`);
};

main().catch(console.error);
