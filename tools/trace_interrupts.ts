import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Interrupt System Trace ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

// Track interrupt events
let frameCount = 0;
let interruptCount = 0;
let lastVdpLine = -1;
let waitLoopHits = 0;
const flagWrites = 0;

const CYCLES_PER_FRAME = 59736;

// Hook CPU stepOne to monitor interrupt acceptance and specific PCs
const originalStepOne = cpu.stepOne.bind(cpu);
let lastPC = -1;

cpu.stepOne = function () {
  const stateBefore = cpu.getState();
  const vdpState = vdp.getState ? vdp.getState?.() : undefined;
  const vdpHasIRQ = vdp.hasIRQ();

  // Check if we're at the wait loop
  if (stateBefore.pc === 0x00d4) {
    waitLoopHits++;
    const flagValue = bus.read8(0xc03d);
    if (waitLoopHits === 1) {
      console.log(`\nFirst hit of wait loop at PC=0x00D4:`);
      console.log(`  Frame: ${frameCount}`);
      console.log(`  Flag at 0xC03D: 0x${flagValue.toString(16).padStart(2, '0')}`);
      console.log(`  IFF1: ${stateBefore.iff1}, IM: ${stateBefore.im}`);
      console.log(`  VDP hasIRQ: ${vdpHasIRQ}`);
      if (vdpState) {
        console.log(`  VDP line: ${vdpState.line}, VBlank IRQ enabled: ${vdpState.vblankIrqEnabled}`);
        console.log(`  VDP status: 0x${vdpState.status.toString(16).padStart(2, '0')}`);
      }
    }

    if (waitLoopHits % 1000 === 0) {
      console.log(`  Still waiting... (${waitLoopHits} iterations, flag=0x${flagValue.toString(16)})`);
    }
  }

  // Check if we jump to interrupt handler
  if (stateBefore.pc === 0x0038 && lastPC !== 0x0037 && lastPC !== 0x0038) {
    interruptCount++;
    console.log(`\nInterrupt #${interruptCount} accepted!`);
    console.log(`  Frame: ${frameCount}`);
    console.log(`  Jumped from PC=0x${lastPC.toString(16).padStart(4, '0')} to 0x0038`);
    if (vdpState) {
      console.log(`  VDP line: ${vdpState.line}`);
    }
  }

  // Track writes to the flag location
  if (stateBefore.pc === 0x00c6 || stateBefore.pc === 0x00c3) {
    // These are common addresses that might write to 0xC03D
    const nextByte = bus.read8(stateBefore.pc);
    if (nextByte === 0x32) {
      // LD (nn), A
      const addr = bus.read8((stateBefore.pc + 1) & 0xffff) | (bus.read8((stateBefore.pc + 2) & 0xffff) << 8);
      if (addr === 0xc03d) {
        console.log(
          `\nPotential write to flag at PC=0x${stateBefore.pc.toString(16)}: A=0x${stateBefore.a.toString(16)}`
        );
      }
    }
  }

  // Monitor VDP line transitions
  if (vdpState && vdpState.line !== lastVdpLine) {
    if (vdpState.line === 192) {
      // VBlank start
      console.log(`\nVBlank start at frame ${frameCount}:`);
      console.log(`  VDP status: 0x${vdpState.status.toString(16).padStart(2, '0')}`);
      console.log(`  VBlank IRQ enabled: ${vdpState.vblankIrqEnabled}`);
      console.log(`  VDP hasIRQ: ${vdpHasIRQ}`);
      console.log(`  CPU IFF1: ${stateBefore.iff1}, PC: 0x${stateBefore.pc.toString(16).padStart(4, '0')}`);
    }
    lastVdpLine = vdpState.line;
  }

  lastPC = stateBefore.pc;
  const result = originalStepOne();

  // Check if interrupt was accepted based on PC change
  const stateAfter = cpu.getState();
  if (stateAfter.pc === 0x0038 && stateBefore.pc !== 0x0037 && stateBefore.pc !== 0x0038 && stateBefore.pc !== 0x0039) {
    console.log(`  -> Interrupt accepted from PC=0x${stateBefore.pc.toString(16).padStart(4, '0')}`);
  }

  return result;
};

// Run for several frames
console.log('Running emulation until we hit the wait loop or 100 frames...\n');

for (let frame = 0; frame < 100 && waitLoopHits === 0; frame++) {
  frameCount = frame;
  let cyclesInFrame = 0;

  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
  }

  const vdpState = vdp.getState?.();
  if (!vdpState) {
    console.error('VDP state not available');
    process.exit(1);
  }
  const cpuState = cpu.getState();
  if (vdpState) {
    console.log(`\nFrame ${frame} complete:`);
    console.log(`  PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
    console.log(`  Interrupts accepted so far: ${interruptCount}`);
    console.log(`  Wait loop hits: ${waitLoopHits}`);
  }
}

// Final analysis
console.log('\n=== Analysis ===');
console.log(`Total interrupts accepted: ${interruptCount}`);
console.log(`Total wait loop iterations: ${waitLoopHits}`);
console.log(`Expected interrupts (1 per frame): ${frameCount}`);

if (interruptCount === 0) {
  console.log('\n❌ NO INTERRUPTS WERE ACCEPTED!');
  console.log('Possible causes:');
  console.log('  1. VDP not generating VBlank IRQ');
  console.log('  2. CPU interrupts disabled (IFF1=false)');
  console.log('  3. VDP VBlank IRQ not enabled in register 1');
  console.log('  4. CPU not checking for interrupts properly');
} else if (waitLoopHits > 1000) {
  console.log('\n❌ Game is stuck in wait loop despite interrupts!');
  console.log('Possible causes:');
  console.log('  1. Interrupt handler not setting flag at 0xC03D');
  console.log('  2. Flag being cleared immediately');
  console.log('  3. Wrong memory address being checked');
}
