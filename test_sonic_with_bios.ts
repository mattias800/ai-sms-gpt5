#!/usr/bin/env tsx

import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'node:fs';

console.log('Testing Sonic with BIOS...');

// Load Sonic ROM
const romData = readFileSync('sonic.sms');
const cart = { rom: new Uint8Array(romData) };

// Load BIOS
const biosData = readFileSync('bios13fx.sms');

// Create machine WITH BIOS
const machine = createMachine({ 
  cart,
  useManualInit: false, // Use BIOS
  bus: { bios: biosData }
});

const vdp = machine.getVDP();
const cpu = machine.getCPU();

console.log('Machine created with BIOS');

// Monitor display enable changes
let displayEnabledCount = 0;
let lastDisplayEnabled = true;

const originalWritePort = vdp.writePort.bind(vdp);
vdp.writePort = (port: number, val: number) => {
  originalWritePort(port, val);
  
  // Check if this affects display enable
  if (port === 0xBF) {
    const reg1 = vdp.getRegister?.(1);
    const displayEnabled = (reg1 ?? 0) & 0x40;
    
    if (displayEnabled !== lastDisplayEnabled) {
      displayEnabledCount++;
      const pc = cpu.getState().pc;
      console.log(`🎮 Display ${displayEnabled ? 'ENABLED' : 'DISABLED'} at PC 0x${pc.toString(16).padStart(4, '0')}, Reg1=0x${reg1?.toString(16).padStart(2, '0')}`);
      lastDisplayEnabled = displayEnabled;
      
      // If display just got enabled, try to render immediately
      if (displayEnabled) {
        console.log('🎯 Display just enabled! Checking for visual output...');
        const frameBuffer = vdp.renderFrame?.();
        if (frameBuffer) {
          let nonZeroPixels = 0;
          for (let j = 0; j < frameBuffer.length; j++) {
            if (frameBuffer[j] !== 0) {
              nonZeroPixels++;
            }
          }
          console.log(`🎨 Visual output: ${nonZeroPixels} non-zero pixels`);
        }
      }
    }
  }
};

console.log('Starting Sonic with BIOS...');

// Run for a reasonable time
for (let i = 0; i < 2000; i++) {
  machine.runCycles(1000); // Run 1000 cycles at a time
  
  const pc = cpu.getState().pc;
  const vdpState = vdp.getState?.();
  
  // Log every 200 iterations
  if (i % 200 === 0) {
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
        console.log(`🎨 VISUAL OUTPUT DETECTED! ${nonZeroPixels} non-zero pixels`);
        break;
      }
    }
  }
  
  // Check if we've made significant progress
  if (pc > 0x0100) {
    console.log(`Sonic progressed to PC 0x${pc.toString(16).padStart(4, '0')}`);
  }
}

// Final state
const finalVdpState = vdp.getState?.();
if (finalVdpState) {
  console.log(`\nFinal state:`);
  console.log(`  PC: 0x${cpu.getState().pc.toString(16).padStart(4, '0')}`);
  console.log(`  Display enabled: ${finalVdpState.displayEnabled}`);
  console.log(`  Register 1: 0x${vdp.getRegister?.(1)?.toString(16).padStart(2, '0')}`);
  console.log(`  Display enable changes: ${displayEnabledCount}`);
  
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

console.log('Sonic with BIOS test completed');



