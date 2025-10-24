#!/usr/bin/env tsx

import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'node:fs';

console.log('Tracing Wonderboy VDP operations...');

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

// Create a logging VDP wrapper to trace all VDP operations
const originalWritePort = vdp.writePort.bind(vdp);
const originalReadPort = vdp.readPort.bind(vdp);

let vdpWriteCount = 0;
vdp.writePort = (port: number, val: number) => {
  vdpWriteCount++;
  const pc = cpu.getState().pc;
  console.log(`VDP Write ${vdpWriteCount}: PC=0x${pc.toString(16).padStart(4, '0')}, Port=0x${port.toString(16).padStart(2, '0')}, Value=0x${val.toString(16).padStart(2, '0')}`);
  
  // Check if this is a register write
  if (port === 0xBF) {
    // This could be a register write - we'd need to track the latch state
    console.log(`  -> Potential VDP register write`);
  }
  
  originalWritePort(port, val);
};

vdp.readPort = (port: number) => {
  const pc = cpu.getState().pc;
  const result = originalReadPort(port);
  console.log(`VDP Read: PC=0x${pc.toString(16).padStart(4, '0')}, Port=0x${port.toString(16).padStart(2, '0')}, Result=0x${result.toString(16).padStart(2, '0')}`);
  return result;
};

console.log('Starting Wonderboy execution with VDP tracing...');

// Run Wonderboy and trace VDP operations
for (let i = 0; i < 1000; i++) {
  machine.runCycles(1000); // Run 1000 cycles at a time
  
  const pc = cpu.getState().pc;
  const vdpState = vdp.getState?.();
  
  // Log every 100 iterations
  if (i % 100 === 0) {
    console.log(`Iteration ${i}: PC=0x${pc.toString(16).padStart(4, '0')}, VDP writes=${vdpWriteCount}, Display enabled=${vdpState?.displayEnabled}`);
  }
  
  // Check if we've made significant progress
  if (pc > 0x0100) {
    console.log(`Wonderboy progressed to PC 0x${pc.toString(16).padStart(4, '0')}`);
    break;
  }
  
  // Stop if we're stuck
  if (i > 50 && pc < 0x00A0) {
    console.log(`Stuck at PC 0x${pc.toString(16).padStart(4, '0')}, stopping`);
    break;
  }
}

// Final VDP state
const finalVdpState = vdp.getState?.();
if (finalVdpState) {
  console.log(`\nFinal VDP state:`);
  console.log(`  Display enabled: ${finalVdpState.displayEnabled}`);
  console.log(`  Register 1: 0x${vdp.getRegister?.(1)?.toString(16).padStart(2, '0')}`);
  console.log(`  Line: ${finalVdpState.line}`);
  console.log(`  Total VDP writes: ${vdpWriteCount}`);
}

console.log('VDP tracing completed');



