import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Trace VBlank Timing vs Wait Loop ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();

let totalCycles = 0;
let waitLoopReached = false;
let lastVBlankCycle = -1;
let vblankCount = 0;

const CYCLES_PER_FRAME = 59736;

// Track each instruction
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const stateBefore = cpu.getState();
  const vdpStateBefore = vdp?.getState?.() ?? {};

  const result = originalStepOne();
  totalCycles += result.cycles;

  const stateAfter = cpu.getState();
  const vdpStateAfter = vdp?.getState?.() ?? {};

  // Check for VBlank transition
  if (vdpStateBefore && vdpStateAfter) {
    if (vdpStateBefore.line < 192 && vdpStateAfter.line >= 192) {
      vblankCount++;
      lastVBlankCycle = totalCycles;
      console.log(`\nVBlank #${vblankCount} started at cycle ${totalCycles}`);
      console.log(`  VDP status: 0x${vdpStateAfter.status.toString(16).padStart(2, '0')}`);
      console.log(`  VDP R1: 0x${vdpStateAfter.regs[1].toString(16).padStart(2, '0')}`);
      console.log(`  VDP hasIRQ: ${vdp.hasIRQ()}`);
      console.log(`  CPU PC: 0x${stateAfter.pc.toString(16).padStart(4, '0')}`);
      console.log(`  CPU IFF1: ${stateAfter.iff1}`);
    }
  }

  // Check for wait loop entry
  if (stateAfter.pc === 0x00d4 && !waitLoopReached) {
    waitLoopReached = true;
    console.log(`\n!!! Wait loop reached at cycle ${totalCycles} !!!`);
    console.log(`  Last VBlank was at cycle ${lastVBlankCycle} (${totalCycles - lastVBlankCycle} cycles ago)`);
    console.log(`  VBlank count so far: ${vblankCount}`);
    if (vdpStateAfter) {
      console.log(`  Current VDP line: ${vdpStateAfter.line}`);
      console.log(`  VDP status: 0x${vdpStateAfter.status.toString(16).padStart(2, '0')}`);
      console.log(`  VDP hasIRQ: ${vdp.hasIRQ()}`);
    }
    console.log(`  CPU IFF1: ${stateAfter.iff1}`);

    // Calculate where we are in the current frame
    const framePosition = totalCycles % CYCLES_PER_FRAME;
    const linePosition = Math.floor(framePosition / 228); // 228 cycles per line
    console.log(`  Position in frame: cycle ${framePosition}/59736, approx line ${linePosition}/262`);
  }

  // Check for status register reads
  if (
    stateBefore.pc === 0x00bf ||
    (result.cycles === 11 &&
      m.getBus().read8(stateBefore.pc) === 0xdb &&
      m.getBus().read8((stateBefore.pc + 1) & 0xffff) === 0xbf)
  ) {
    console.log(`\nStatus register read at PC=0x${stateBefore.pc.toString(16).padStart(4, '0')}, cycle ${totalCycles}`);
    if (vdpStateBefore) {
      console.log(`  Status before: 0x${vdpStateBefore.status.toString(16).padStart(2, '0')}`);
      console.log(`  VDP hasIRQ before: ${vdp.hasIRQ()}`);
    }
  }

  return result;
};

// Run until we hit the wait loop
console.log('Running emulation until wait loop is reached...\n');

while (!waitLoopReached && totalCycles < CYCLES_PER_FRAME * 100) {
  cpu.stepOne();
  vdp.tickCycles(1);
}

if (!waitLoopReached) {
  console.log('\nWait loop was never reached!');
} else {
  // Continue for a bit more to see if VBlank happens
  console.log('\nContinuing for one more frame to see if VBlank occurs...');

  const startCycle = totalCycles;
  while (totalCycles < startCycle + CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    vdp.tickCycles(result.cycles);

    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }
    if (vdpState && vdpState.line === 192 && vdp.hasIRQ()) {
      console.log(`\nVBlank IRQ asserted at cycle ${totalCycles}!`);
      console.log(`  ${totalCycles - startCycle} cycles after entering wait loop`);
      break;
    }
  }
}
