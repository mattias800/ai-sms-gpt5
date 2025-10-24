import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const testSonicIRQ = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const vdp = m.getVDP();
  const psg = m.getPSG();

  // Run for ~300 frames to see if IRQs fire
  const cyclesPerFrame = 60000; // approximate
  const framesToRun = 300;
  const cyclesToRun = cyclesPerFrame * framesToRun;

  let irqCount = 0;
  let frame = 0;

  console.log('Running Sonic title screen and tracing VBlank IRQs...\n');

  let cyclesExecuted = 0;
  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    if (vdp.hasIRQ()) {
      irqCount++;
      const state = cpu.getState();
      if (irqCount <= 5 || irqCount % 50 === 0) {
        console.log(`Frame ~${frame}: IRQ #${irqCount} at cycle ${cyclesExecuted}, PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`);
      }
    }

    // Every frame, check stats
    if (cyclesExecuted % cyclesPerFrame === 0) {
      frame++;
      const psgState = psg.getState();
      const activeVols = psgState.vols.filter(v => (v & 0xf) < 0xf);
      if (frame % 50 === 0 || frame <= 5) {
        console.log(`  @ Frame ${frame}: IRQs so far: ${irqCount}, PSG volumes: [${psgState.vols.join(',')}] active: ${activeVols.length}`);
      }
    }
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Total IRQs fired: ${irqCount}`);
  console.log(`Expected IRQs: ~${framesToRun} (1 per frame)`);
  console.log(`IRQ cadence: ${irqCount > 0 ? (framesToRun / irqCount).toFixed(2) + ' frames/IRQ' : 'NO IRQs'}`);

  const psgFinal = psg.getState();
  console.log(`\nFinal PSG state:`);
  console.log(`  Volumes: [${psgFinal.vols.join(',')}]`);
  console.log(`  Tones: [${psgFinal.tones.join(',')}]`);
  console.log(`  Any unmuted: ${psgFinal.vols.some(v => (v & 0xf) < 0xf) ? 'YES' : 'NO'}`);
};

testSonicIRQ().catch(console.error);
