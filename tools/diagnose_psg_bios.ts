import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Diagnose PSG behavior during BIOS to see actual tone values
 */

const main = async () => {
  console.log('=== PSG BIOS DIAGNOSIS ===\n');

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
  const bus = m.getBus();

  // Track all PSG writes
  const psgEvents: any[] = [];
  const originalWrite = bus.writeIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      psgEvents.push({
        pc: state.pc & 0xffff,
        val: val & 0xff,
        cycleCount: state.cycleCount || 0,
      });
    }
    return originalWrite(port, val);
  };

  // Run 3 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 3;

  console.log('Running 3 frames of BIOS...\n');

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`=== PSG WRITE EVENTS (${psgEvents.length} total) ===\n`);

  // Show all writes with interpretation
  for (let i = 0; i < Math.min(100, psgEvents.length); i++) {
    const e = psgEvents[i];
    const v = e.val;
    let desc = '';

    if (v & 0x80) {
      const ch = (v >> 5) & 0x03;
      const isVol = (v & 0x10) !== 0;
      const data = v & 0x0f;

      if (isVol) {
        desc = `VOL CH${ch}=${data.toString().padStart(2)}`;
      } else {
        desc = `TONE_LO CH${ch}=${data.toString(2).padStart(4, '0')}`;
      }
    } else {
      const data = v & 0x3f;
      desc = `DATA=${data.toString(2).padStart(6, '0')}`;
    }

    console.log(`[${i.toString().padStart(3)}] PC=0x${e.pc.toString(16).padStart(4, '0')} val=0x${v.toString(16).padStart(2, '0')} (${desc})`);
  }

  // Get final PSG state
  console.log('\n=== FINAL PSG STATE ===\n');
  const psgState = psg.getState();
  console.log(`Tones:  [${psgState.tones.join(', ')}]`);
  console.log(`Volumes: [${psgState.vols.join(', ')}]`);
  console.log(`Counters: [${psgState.counters.join(', ')}]`);
  console.log(`Outputs: [${psgState.outputs.join(', ')}]`);
  console.log(`Noise: mode=${psgState.noise.mode}, shift=${psgState.noise.shift}`);

  // Manually check what frequencies should be
  console.log('\n=== TONE ANALYSIS ===\n');

  // Extract tone writes
  let latched = [0, 0, 0];
  for (const e of psgEvents) {
    const v = e.val;
    if (v & 0x80 && !(v & 0x10)) {
      // Tone latch
      const ch = (v >> 5) & 0x03;
      if (ch < 3) {
        latched[ch] = v & 0x0f;
      }
    } else if (!(v & 0x80) && latched) {
      // Data byte - figure out which channel
      const data = v & 0x3f;
      console.log(`Data write: 0x${data.toString(16).padStart(2, '0')} (binary: ${data.toString(2).padStart(6, '0')})`);
    }
  }

  console.log('\n=== AUDIO SAMPLE CHECK ===\n');
  let audioEnergy = 0;
  let maxAmp = 0;
  for (let i = 0; i < 44100; i++) {
    const s = psg.getSample();
    audioEnergy += s * s;
    if (Math.abs(s) > maxAmp) maxAmp = Math.abs(s);
  }
  const rms = Math.sqrt(audioEnergy / 44100) / 32768;
  console.log(`RMS: ${rms.toFixed(6)}`);
  console.log(`Max amplitude: ${maxAmp}`);

  if (rms < 0.001) {
    console.log('\n⚠️  Very quiet audio - PSG may not be working correctly');
  }
};

main().catch(console.error);
