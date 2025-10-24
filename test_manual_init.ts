#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SmsBus } from './src/bus/bus.js';
import { createVDP } from './src/vdp/vdp.js';
import { createPSG } from './src/psg/sn76489.js';
import { initializeSMS, enableSMSInterrupts } from './src/machine/sms_init.js';
import { readFileSync } from 'node:fs';

// Test manual SMS initialization with Wonderboy
const romData = readFileSync('wonderboy5.sms');
const cart: Cartridge = { rom: new Uint8Array(romData) };

const vdp = createVDP();
const psg = createPSG();
const bus = new SmsBus(cart, vdp, psg, null, null, { 
  allowCartRam: true, 
  bios: null // No BIOS - use manual initialization
});

const cpu = createZ80({
  bus,
  experimentalFastBlockOps: true,
  onCycle: (cycles: number) => {
    vdp.tickCycles(cycles);
    psg.tickCycles(cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
  },
});

console.log('Testing manual SMS initialization with Wonderboy...');

// Initialize SMS system manually (replaces BIOS)
initializeSMS({ cpu, vdp, psg, bus });

// Enable interrupts
enableSMSInterrupts(cpu);

console.log('Manual initialization complete, starting Wonderboy...');

// Run Wonderboy for a few steps to see if it progresses
let stepCount = 0;
let interruptCount = 0;

while (stepCount < 1000) {
  const result = cpu.stepOne();
  stepCount++;
  
  if (result.irqAccepted) {
    interruptCount++;
    console.log(`Step ${stepCount}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, IRQ accepted (${interruptCount})`);
  }
  
  if (stepCount % 100 === 0) {
    const state = cpu.getState();
    console.log(`Step ${stepCount}: PC=${state.pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, interrupts=${interruptCount}, halted=${state.halted}`);
  }
  
  // Check if we're making progress
  if (stepCount > 100 && cpu.getState().pc > 0x0100) {
    console.log(`Wonderboy is progressing! PC=${cpu.getState().pc.toString(16).padStart(4, '0')}`);
    break;
  }
  
  // Check if we're stuck in a loop
  if (stepCount > 200 && cpu.getState().pc < 0x0100) {
    console.log(`Still stuck at PC ${cpu.getState().pc.toString(16).padStart(4, '0')}`);
    break;
  }
}

console.log(`Total interrupts: ${interruptCount}`);
console.log('Manual initialization test completed');



