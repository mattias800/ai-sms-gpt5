#!/usr/bin/env tsx

import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'node:fs';

console.log('Running Wonderboy for extended period to see display re-enable...');

// Load Wonderboy ROM
const romData = readFileSync('wonderboy5.sms');
const cart = { rom: new Uint8Array(romData) };

// Create machine with manual initialization
const machine = createMachine({ 
  cart,
  useManualInit: true
});

const vdp = machine.getVDP();
const cpu = machine.getCPU();

let lastDisplayEnabled = true;
let displayEnabledChanges = 0;

// Monitor VDP register 1 changes
const originalWritePort = vdp.writePort.bind(vdp);
vdp.writePort = (port: number, val: number) => {
  originalWritePort(port, val);
  
  // Check if this affects display enable
  if (port === 0xBF) {
    const reg1 = vdp.getRegister?.(1);
    const displayEnabled = (reg1 ?? 0) & 0x40;
    
    if (displayEnabled !== lastDisplayEnabled) {
      displayEnabledChanges++;
      const pc = cpu.getState().pc;
      console.log(`Display ${displayEnabled ? 'ENABLED' : 'DISABLED'} at PC 0x${pc.toString(16).padStart(4, '0')}, Reg1=0x${reg1?.toString(16).padStart(2, '0')}`);
      lastDisplayEnabled = displayEnabled;
    }
  }
};

console.log('Starting extended Wonderboy run...');

// Run for a much longer time
for (let i = 0; i < 10000; i++) {
  machine.runCycles(1000); // Run 1000 cycles at a time
  
  const pc = cpu.getState().pc;
  const vdpState = vdp.getState?.();
  
  // Log every 1000 iterations
  if (i % 1000 === 0) {
    console.log(`Iteration ${i}: PC=0x${pc.toString(16).padStart(4, '0')}, Display enabled=${vdpState?.displayEnabled}, Line=${vdpState?.line}`);
  }
  
  // Check if we've made significant progress
  if (pc > 0x0200) {
    console.log(`Wonderboy progressed to PC 0x${pc.toString(16).padStart(4, '0')}`);
  }
  
  // Try to render a frame periodically
  if (i % 1000 === 0 && vdpState?.displayEnabled) {
    const frameBuffer = vdp.renderFrame?.();
    if (frameBuffer) {
      let nonZeroPixels = 0;
      for (let j = 0; j < frameBuffer.length; j++) {
        if (frameBuffer[j] !== 0) {
          nonZeroPixels++;
        }
      }
      if (nonZeroPixels > 0) {
        console.log(`🎮 VISUAL OUTPUT DETECTED! ${nonZeroPixels} non-zero pixels`);
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
  console.log(`  Display enable changes: ${displayEnabledChanges}`);
  
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

console.log('Extended Wonderboy run completed');



