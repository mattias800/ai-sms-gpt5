#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SmsBus } from './src/bus/bus.js';
import { createVDP } from './src/vdp/vdp.js';
import { createPSG } from './src/psg/sn76489.js';
import { readFileSync } from 'node:fs';

// Test BIOS only
const biosData = readFileSync('bios13fx.sms');
const bios = new Uint8Array(biosData);

// Create a dummy cartridge (empty ROM)
const dummyRom = new Uint8Array(0x4000); // 16KB dummy ROM
const cart: Cartridge = { rom: dummyRom };

const vdp = createVDP();
const psg = createPSG();
const bus = new SmsBus(cart, vdp, psg, null, null, { 
  allowCartRam: true, 
  bios: bios 
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

console.log('Testing BIOS only...');
console.log(`BIOS enabled: ${bus.getBiosEnabled()}`);
console.log(`BIOS size: ${bios.length} bytes`);

// Reset CPU
cpu.reset();

// Run for a few steps to see what happens
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
    console.log(`Step ${stepCount}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, interrupts=${interruptCount}, BIOS enabled=${bus.getBiosEnabled()}`);
  }
  
  // Check if we're stuck in a loop
  if (stepCount > 100 && cpu.getState().pc < 0x0100) {
    console.log(`Possible stuck in loop at PC ${cpu.getState().pc.toString(16).padStart(4, '0')}`);
    break;
  }
}

console.log(`Total interrupts: ${interruptCount}`);
console.log('BIOS only test completed');



