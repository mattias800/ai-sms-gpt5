import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace what BIOS does to PSG
 */

const main = async () => {
  console.log('=== BIOS PSG INITIALIZATION ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const biosPath = './third_party/mame/roms/sms1/mpr-10052.rom';
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
  const psg = m.getPSG();
  const cpu = m.getCPU();
  const bus = m.getBus();

  // Trace PSG writes
  const psgWrites: any[] = [];
  const originalWrite = bus.writeIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const cycleCount = state.cycleCount || 0;
      const frame = Math.floor((cycleCount / (228 * 262)) % 10000);
      psgWrites.push({
        frame,
        pc: state.pc & 0xffff,
        val: val & 0xff,
        cycleCount,
      });
    }
    return originalWrite(port, val);
  };

  // Run only BIOS (first 3.2 seconds = ~200 frames at 60 Hz)
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 5;

  console.log('Tracing first 5 frames (BIOS initialization)...\n');

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`Found ${psgWrites.length} PSG writes\n`);

  // Show all writes
  console.log('PSG Writes:');
  for (const w of psgWrites) {
    const v = w.val & 0xff;
    let desc = '';
    if (v & 0x80) {
      const ch = (v >> 5) & 0x03;
      const isVol = (v & 0x10) !== 0;
      const data = v & 0x0f;
      if (isVol) {
        desc = ` VOL CH${ch}=${data} (${data === 15 ? 'MUTE' : 'AUDIBLE'})`;
      } else {
        desc = ` TONE_LO CH${ch}=${data}`;
      }
    } else {
      desc = ` DATA=${v}`;
    }
    console.log(`  Frame ${w.frame}: PC=0x${w.pc.toString(16).padStart(4, '0')} val=0x${v.toString(16).padStart(2, '0')}${desc}`);
  }

  // Show PSG state at end
  console.log('\nFinal PSG State (after 5 frames):');
  const finalState = psg.getState();
  console.log(`  Volumes: [${finalState.vols.join(', ')}]`);
  console.log(`  Tones: [${finalState.tones.join(', ')}]`);
  console.log(`  Sample: ${psg.getSample()}`);
};

main().catch(console.error);
