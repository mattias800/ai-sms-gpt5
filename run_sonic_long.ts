import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const runLongSonic = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  
  const cpu = m.getCPU();
  const psg = m.getPSG();

  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 300; // Run for 300 frames (~5 seconds)
  const targetCycles = FRAME_CYCLES * targetFrames;

  console.log(`Running Sonic for ${targetFrames} frames...\n`);

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
    
    const frame = Math.floor(cyclesExecuted / FRAME_CYCLES);
    if (frame % 60 === 0 && frame > 0) {
      const psgState = psg.getState();
      const audible = psgState.vols.filter(v => (v & 0xf) < 0xf).length;
      console.log(`Frame ${frame}: PSG volumes=[${psgState.vols.join(',')}], audible channels=${audible}`);
    }
  }

  const psgFinal = psg.getState();
  console.log(`\n=== FINAL STATE ===`);
  console.log(`PSG volumes=[${psgFinal.vols.join(',')}]`);
  console.log(`Any audible: ${psgFinal.vols.some(v => (v & 0xf) < 0xf)}`);
  console.log(`Tones=[${psgFinal.tones.join(',')}]`);
};

runLongSonic().catch(console.error);
