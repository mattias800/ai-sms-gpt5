import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const traceAllPSGIO = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const bus = m.getBus();

  // Instrument writeIO8 to catch PSG writes
  const originalWrite = bus.writeIO8.bind(bus);
  let psgWriteCount = 0;
  const psgWrites: { port: number; val: number; pc: number }[] = [];

  bus.writeIO8 = (port: number, val: number) => {
    // PSG is typically at 0x7F and mirrors
    // Check both common addresses
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff || port === 0x7e || port === 0xfe) {
      psgWriteCount++;
      const state = cpu.getState();
      const pc = state.pc & 0xffff;
      psgWrites.push({ port, val, pc });

      if (psgWriteCount <= 50) {
        console.log(`PSG write #${psgWriteCount}: port=0x${port.toString(16).padStart(2, '0')}, val=0x${val.toString(16).padStart(2, '0')}, PC=0x${pc.toString(16).padStart(4, '0')}`);
      }
    }
    return originalWrite(port, val);
  };

  // Run for ~5 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 5;

  console.log('Tracing ALL PSG I/O writes...\n');

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  const framesRun = Math.floor(cyclesExecuted / FRAME_CYCLES);

  console.log(`\n=== RESULTS ===`);
  console.log(`Frames run: ${framesRun}`);
  console.log(`Total PSG writes: ${psgWriteCount}`);
  console.log(`Writes per frame: ${(psgWriteCount / framesRun).toFixed(1)}`);

  // Analyze write patterns
  if (psgWriteCount > 0) {
    const volumeWrites = psgWrites.filter(w => w.val & 0x80 && w.val & 0x10);
    const frequencyWrites = psgWrites.filter(w => w.val & 0x80 && !(w.val & 0x10));
    const dataWrites = psgWrites.filter(w => !(w.val & 0x80));

    console.log(`\nWrite breakdown:`);
    console.log(`  Volume writes (latch+volume): ${volumeWrites.length}`);
    console.log(`  Frequency writes (latch+freq): ${frequencyWrites.length}`);
    console.log(`  Data writes (continuation): ${dataWrites.length}`);

    // Check volumes
    const unmutedVolumes = volumeWrites.filter(w => (w.val & 0x0f) < 0x0f);
    console.log(`\n  Unmuted volume writes (vol < 0xF): ${unmutedVolumes.length}`);
    if (unmutedVolumes.length === 0 && volumeWrites.length > 0) {
      console.log('  ⚠️  All volume writes keep channels muted (volume = 0xF)');
    } else if (unmutedVolumes.length > 0) {
      console.log(`  ✅ Sonic DOES unmute audio (${unmutedVolumes.length} unmutes)`);
    }
  } else {
    console.log('\n❌ No PSG writes detected at all!');
    console.log('   → PSG is not being accessed');
    console.log('   → Audio initialization may not even be attempted');
  }
};

traceAllPSGIO().catch(console.error);
