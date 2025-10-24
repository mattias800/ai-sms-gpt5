import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const traceSonicISRInstructions = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
    trace: {
      traceDisasm: true,
      onTrace: (ev) => {
        // Trace will be captured via callback
      }
    }
  });

  const cpu = m.getCPU();
  const vdp = m.getVDP();

  // Collect trace events
  const traceEvents: any[] = [];
  const originalTrace = m.getCPU as any;

  // Instead, let's manually step and check PC
  let isrActive = false;
  let lastIFF1 = true;
  let instructionsInISR: { pc: number; opcode: number | null }[] = [];
  let frameCount = 0;

  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 1.5;

  console.log('Tracing instruction flow in Sonic ISR...\n');

  let capturedISRs = 0;
  const MAX_ISRS_TO_CAPTURE = 2;

  while (cyclesExecuted < targetCycles && capturedISRs < MAX_ISRS_TO_CAPTURE) {
    const prevIFF1 = lastIFF1;
    const stateBefore = cpu.getState();
    const pcBefore = stateBefore.pc & 0xffff;

    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const stateAfter = cpu.getState();
    const currIFF1 = !!stateAfter.iff1;
    const pcAfter = stateAfter.pc & 0xffff;

    // Detect ISR entry
    if (prevIFF1 && !currIFF1) {
      isrActive = true;
      instructionsInISR = [];
      console.log(`\n📍 ISR ENTERED at PC=0x${pcBefore.toString(16).padStart(4, '0')}`);
      instructionsInISR.push({ pc: pcBefore, opcode: null });
    }

    // Track instructions while in ISR
    if (isrActive) {
      // Fetch opcode at current PC before this instruction
      const opcode = rom[pcBefore];
      instructionsInISR.push({ pc: pcBefore, opcode });

      // Print first 30 instructions
      if (instructionsInISR.length <= 30) {
        const mnemonicMap: { [key: number]: string } = {
          0x00: 'NOP',
          0x76: 'HALT',
          0xc9: 'RET',
          0xfb: 'EI',
          0xf3: 'DI',
          0xed: 'ED xx',
          0xcd: 'CALL nn',
          0xc3: 'JP nn',
          0xd3: 'OUT (n),A',
          0xdb: 'IN A,(n)',
        };
        
        const mnem = mnemonicMap[opcode] || `0x${opcode.toString(16).padStart(2, '0')}`;
        console.log(`  [${instructionsInISR.length-1}] PC=0x${pcBefore.toString(16).padStart(4, '0')} op=${mnem}`);
      }
    }

    // Detect ISR exit
    if (!prevIFF1 && currIFF1) {
      isrActive = false;
      capturedISRs++;
      console.log(`   ISR EXITED: ${instructionsInISR.length} instructions`);
      
      // Look for patterns
      const hasRET = instructionsInISR.some(i => i.opcode === 0xc9);
      const hasRETI = instructionsInISR.some(i => i.opcode === 0xed);
      const hasOUT7F = instructionsInISR.filter(i => i.opcode === 0xd3).length > 0;
      const hasJP = instructionsInISR.filter(i => i.opcode === 0xc3).length > 0;
      const hasCALL = instructionsInISR.filter(i => i.opcode === 0xcd).length > 0;

      console.log(`   Patterns: RET=${hasRET}, RETI=${hasRETI}, OUT.7F=${hasOUT7F}, JP=${hasJP}, CALL=${hasCALL}`);
    }

    lastIFF1 = currIFF1;
  }

  console.log('\n=== SUMMARY ===');
  console.log('If ISR contains CALL instructions, audio code may be in subroutines');
  console.log('If ISR contains only RET, it might be a stub or placeholder');
  console.log('If ISR contains OUT 0x7F, we should see PSG writes');
};

traceSonicISRInstructions().catch(console.error);
