import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';
import { execSync } from 'child_process';

/**
 * Compare Sonic audio behavior between our emulator and MAME
 * This will help identify timing/initialization differences
 */

const compareSonicAudioTraces = async () => {
  console.log('=== SONIC AUDIO TRACE COMPARISON ===\n');

  // Step 1: Capture our emulator's PSG writes
  console.log('Step 1: Capturing PSG writes from our emulator...');
  
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  const cpu = m.getCPU();
  const bus = m.getBus();

  const ourWrites: any[] = [];
  const originalWrite = bus.writeIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      ourWrites.push({
        frame: 0,
        cycle: 0,
        pc: state.pc & 0xffff,
        port: port & 0xff,
        val: val & 0xff,
      });
    }
    return originalWrite(port, val);
  };

  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 10;

  let frame = 0;
  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
    const newFrame = Math.floor(cyclesExecuted / FRAME_CYCLES);
    if (newFrame !== frame) {
      for (const w of ourWrites.filter(x => x.frame === 0)) {
        w.frame = newFrame;
      }
      frame = newFrame;
    }
  }

  console.log(`Captured ${ourWrites.length} PSG writes\n`);

  // Analyze our writes
  console.log('Our emulator PSG writes:');
  const byFrame = new Map<number, any[]>();
  for (const w of ourWrites) {
    if (!byFrame.has(w.frame)) byFrame.set(w.frame, []);
    byFrame.get(w.frame)!.push(w);
  }

  for (const [frNum, writes] of byFrame) {
    const volumeWrites = writes.filter(w => w.val & 0x80 && w.val & 0x10);
    const unmuted = volumeWrites.filter(w => (w.val & 0x0f) < 0xf);
    console.log(`  Frame ${frNum}: ${writes.length} writes, ${unmuted.length} unmutes`);
    for (const w of writes.slice(0, 5)) {
      const v = w.val;
      if (v & 0x80 && v & 0x10) {
        const vol = v & 0x0f;
        console.log(`    PC=0x${w.pc.toString(16).padStart(4, '0')}: Volume=${vol}`);
      }
    }
  }

  // Step 2: Suggest MAME comparison
  console.log('\n=== MAME COMPARISON ===');
  console.log('To compare with real hardware:');
  console.log('1. Run: npm run trace:sms');
  console.log('2. Check traces/sms-*.log for CPU trace');
  console.log('3. Look for PC=0x16741 (our PSG init location)');
  console.log('4. Check if MAME has PSG writes before frame 10');
  console.log('\n=== KEY QUESTION ===');
  console.log('Does MAME ever write unmute (volume < 15) to PSG port 0x7F?');
  console.log('If NO: Sonic never unmutes, our emulator is correct');
  console.log('If YES: We need to find where those writes come from');
};

compareSonicAudioTraces().catch(console.error);
