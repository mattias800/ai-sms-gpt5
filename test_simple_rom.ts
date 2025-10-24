#!/usr/bin/env tsx

import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'node:fs';

console.log('Testing simple ROM (im1_test.sms)...');

// Load simple ROM
const romData = readFileSync('roms/im1_test.sms');
const cart = { rom: new Uint8Array(romData) };

// Create machine with manual initialization
const machine = createMachine({ 
  cart,
  useManualInit: true
});

const vdp = machine.getVDP();
const cpu = machine.getCPU();

console.log('Running simple ROM...');

// Run for a reasonable time
for (let i = 0; i < 1000; i++) {
  machine.runCycles(1000); // Run 1000 cycles at a time
  
  const pc = cpu.getState().pc;
  const vdpState = vdp.getState?.();
  
  // Log every 100 iterations
  if (i % 100 === 0) {
    console.log(`Iteration ${i}: PC=0x${pc.toString(16).padStart(4, '0')}, Display=${vdpState?.displayEnabled}, Line=${vdpState?.line}`);
  }
  
  // Check for visual output when display is enabled
  if (vdpState?.displayEnabled) {
    const frameBuffer = vdp.renderFrame?.();
    if (frameBuffer) {
      let nonZeroPixels = 0;
      for (let j = 0; j < frameBuffer.length; j++) {
        if (frameBuffer[j] !== 0) {
          nonZeroPixels++;
        }
      }
      if (nonZeroPixels > 0) {
        console.log(`🎨 VISUAL OUTPUT! ${nonZeroPixels} non-zero pixels`);
        break;
      }
    }
  }
}

// Final state
const finalVdpState = vdp.getState?.();
if (finalVdpState) {
  console.log(`\nFinal state:`);
  console.log(`  PC: 0x${cpu.getState().pc.toString(16).padStart(4, '0')}`);
  console.log(`  Display enabled: ${finalVdpState.displayEnabled}`);
  console.log(`  Register 1: 0x${vdp.getRegister?.(1)?.toString(16).padStart(2, '0')}`);
  
  // Try final render
  if (finalVdpState.displayEnabled) {
    const frameBuffer = vdp.renderFrame?.();
    if (frameBuffer) {
      let nonZeroPixels = 0;
      for (let j = 0; j < frameBuffer.length; j++) {
        if (frameBuffer[j] !== 0) {
          nonZeroPixels++;
        }
      }
      console.log(`Final frame: ${nonZeroPixels} non-zero pixels`);
    }
  }
}

console.log('Simple ROM test completed');



