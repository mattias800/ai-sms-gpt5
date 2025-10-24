import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace ALL PSG writes from Sonic
 */

const main = async () => {
  console.log('=== SONIC PSG WRITES TRACE ===\n');

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
  const bus = m.getBus();

  // Track all PSG writes
  const psgWrites: any[] = [];
  const originalWrite = bus.writeIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      psgWrites.push({
        pc: state.pc & 0xffff,
        val: val & 0xff,
      });
    }
    return originalWrite(port, val);
  };

  // Run 300 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 300;

  console.log(`Running ${targetFrames} frames...\n`);

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`Found ${psgWrites.length} PSG writes\n`);

  // Group by channel and type
  const byChannel: { [key: number]: any[] } = {};
  
  for (const w of psgWrites) {
    const v = w.val;
    let ch = -1;
    let type = 'data';
    
    if (v & 0x80) {
      ch = (v >> 5) & 0x03;
      type = (v & 0x10) ? 'volume' : 'tone_lo';
    }
    
    const key = `${ch}_${type}`;
    if (!byChannel[key]) byChannel[key] = [];
    byChannel[key].push(w);
  }

  console.log('=== PSG WRITES BY CHANNEL ===\n');
  for (const key of Object.keys(byChannel).sort()) {
    const writes = byChannel[key];
    console.log(`${key}: ${writes.length} writes`);
  }

  console.log('\n=== FIRST 50 WRITES ===\n');
  for (let i = 0; i < Math.min(50, psgWrites.length); i++) {
    const w = psgWrites[i];
    const v = w.val;
    let desc = '';
    
    if (v & 0x80) {
      const ch = (v >> 5) & 0x03;
      if (v & 0x10) {
        const vol = v & 0x0f;
        desc = `VOL CH${ch}=${vol}`;
      } else {
        const data = v & 0x0f;
        desc = `TONE_LO CH${ch}=${data}`;
      }
    } else {
      const data = v & 0x3f;
      desc = `DATA=${data}`;
    }
    
    console.log(`[${i.toString().padStart(2)}] PC=0x${w.pc.toString(16).padStart(4, '0')} 0x${v.toString(16).padStart(2, '0')} (${desc})`);
  }

  // Check if channels 0 and 1 are ever written
  console.log('\n=== CHANNEL COVERAGE ===\n');
  const ch0Writes = psgWrites.filter(w => {
    const v = w.val;
    if (!(v & 0x80)) return false; // Skip data bytes
    return ((v >> 5) & 0x03) === 0;
  });
  
  const ch1Writes = psgWrites.filter(w => {
    const v = w.val;
    if (!(v & 0x80)) return false;
    return ((v >> 5) & 0x03) === 1;
  });
  
  console.log(`Channel 0 writes: ${ch0Writes.length}`);
  console.log(`Channel 1 writes: ${ch1Writes.length}`);
  
  if (ch0Writes.length === 0 && ch1Writes.length === 0) {
    console.log('\n⚠️  Channels 0 and 1 are never written!');
    console.log('This means Sonic only uses Channel 2 for audio.');
    console.log('For chords, we would need multiple channels with different frequencies.');
  }
};

main().catch(console.error);
