import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const traceISRCodePath = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();

  // Track execution during ISR
  let isrActive = false;
  let lastIFF1 = true;
  let isrInstructionsSeen = 0;
  const isrPCsSeen = new Set<number>();
  const isrInstructions: number[] = [];

  // Run and collect ISR code paths
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 2; // Run for 2 frames

  console.log('Tracing Sonic ISR code execution...\n');

  while (cyclesExecuted < targetCycles) {
    const prevIFF1 = lastIFF1;
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const state = cpu.getState();
    const currIFF1 = !!state.iff1;

    // Detect ISR entry
    if (prevIFF1 && !currIFF1) {
      isrActive = true;
      isrInstructionsSeen = 0;
      isrPCsSeen.clear();
      isrInstructions.length = 0;
      console.log(`\n📍 ISR ENTERED at cycle ${cyclesExecuted}, PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`);
    }

    // Track code execution during ISR
    if (isrActive) {
      const pc = state.pc & 0xffff;
      if (!isrPCsSeen.has(pc)) {
        isrPCsSeen.add(pc);
        isrInstructions.push(pc);
        
        if (isrInstructions.length <= 20) {
          console.log(`   [${isrInstructions.length}] PC=0x${pc.toString(16).padStart(4, '0')}`);
        }
      }
      isrInstructionsSeen++;
    }

    // Detect ISR exit
    if (!prevIFF1 && currIFF1) {
      isrActive = false;
      const uniqueAddrs = isrPCsSeen.size;
      console.log(`   ISR EXITED: visited ${uniqueAddrs} unique PCs, executed ${isrInstructionsSeen} total instructions`);
    }

    lastIFF1 = currIFF1;
  }

  console.log('\n=== ISR CODE ANALYSIS ===');
  console.log('Expected ISR entry point: 0x0038 (RST 38h / VBlank vector)');
  console.log('\nIf ISR starts at 0x0038 and immediately jumps to other code,');
  console.log('that jump destination is where Sonic\'s actual ISR handler lives.');
  console.log('\nCheck the first few PCs in each ISR to see the code path.');
};

traceISRCodePath().catch(console.error);
