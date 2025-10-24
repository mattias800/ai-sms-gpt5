import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const longTrace = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  const cpu = m.getCPU();
  const bus = m.getBus();

  const originalWrite = bus.writeIO8.bind(bus);
  const unmutedWrites: any[] = [];

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const v = val & 0xff;
      if (v & 0x80 && v & 0x10) {
        const vol = v & 0x0f;
        if (vol < 0xf) {
          const state = cpu.getState();
          unmutedWrites.push({ vol, ch: (v >>> 5) & 0x03, pc: state.pc & 0xffff, val: v });
        }
      }
    }
    return originalWrite(port, val);
  };

  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 600; // 10 seconds

  console.log('Searching for PSG unmute commands over 600 frames...');
  let lastReport = 0;

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const frame = Math.floor(cyclesExecuted / FRAME_CYCLES);
    if (frame !== lastReport && frame % 100 === 0) {
      console.log(`Frame ${frame}... (unmutes found: ${unmutedWrites.length})`);
      lastReport = frame;
    }
  }

  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`PSG unmute writes found: ${unmutedWrites.length}`);
  
  if (unmutedWrites.length > 0) {
    console.log('\n✅ SONIC UNMUTES AUDIO!');
    for (const w of unmutedWrites.slice(0, 20)) {
      console.log(`  PC=0x${w.pc.toString(16).padStart(4, '0')}: Ch${w.ch} vol=${w.vol}`);
    }
  } else {
    console.log('\n❌ SONIC NEVER UNMUTES - AUDIO REMAINS SILENT THE ENTIRE TIME');
  }
};

longTrace().catch(console.error);