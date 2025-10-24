import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const traceSonicISR = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const vdp = m.getVDP();

  // Run for ~3 frames and trace ISR entries/exits
  const cyclesPerFrame = 60000; // approximate
  const framesToRun = 3;
  const cyclesToRun = cyclesPerFrame * framesToRun;

  let isrEnter = 0;
  let isrExit = 0;
  let totalIRQs = 0;
  let lastIFF1 = true;

  console.log('Tracing Sonic ISR entry/exit...\n');

  let cyclesExecuted = 0;
  while (cyclesExecuted < cyclesToRun) {
    const prevIFF1 = lastIFF1;
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
    
    const state = cpu.getState();
    const currIFF1 = !!state.iff1;

    // Detect ISR entry: IFF1 false (masked), PC at ISR vector
    if (prevIFF1 && !currIFF1) {
      isrEnter++;
      console.log(`[${cyclesExecuted}] ISR ENTER #${isrEnter}: PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}, IFF1 disabled`);
    }

    // Detect ISR exit: IFF1 re-enabled
    if (!prevIFF1 && currIFF1) {
      isrExit++;
      console.log(`[${cyclesExecuted}] ISR EXIT  #${isrExit}: PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}, IFF1 re-enabled`);
    }

    if (vdp.hasIRQ()) {
      totalIRQs++;
      if (totalIRQs % 200 === 0) {
        console.log(`  ... IRQ pending (count: ${totalIRQs}), IFF1=${currIFF1 ? '1' : '0'}, PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`);
      }
    }

    lastIFF1 = currIFF1;
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`ISR entries: ${isrEnter}`);
  console.log(`ISR exits: ${isrExit}`);
  console.log(`Unmatched entries (stuck): ${isrEnter - isrExit}`);
  console.log(`Total IRQs pending: ${totalIRQs}`);

  const finalState = cpu.getState();
  console.log(`\nFinal CPU state:`);
  console.log(`  PC: 0x${(finalState.pc & 0xffff).toString(16).padStart(4, '0')}`);
  console.log(`  IFF1: ${finalState.iff1 ? 'enabled' : 'disabled'}`);
  console.log(`  IM: ${finalState.im}`);
  console.log(`  HALT: ${finalState.halted ? 'yes' : 'no'}`);
};

traceSonicISR().catch(console.error);
