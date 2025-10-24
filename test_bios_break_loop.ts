#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SmsBus } from './src/bus/bus.js';
import { createVDP } from './src/vdp/vdp.js';
import { createPSG } from './src/psg/sn76489.js';
import { readFileSync } from 'node:fs';

// Test BIOS with manual loop break
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

console.log('Testing BIOS with manual loop break...');

// Reset CPU
cpu.reset();

// Run until we get to the problematic loop
let stepCount = 0;
let lastPC = 0;

while (stepCount < 100) {
  const result = cpu.stepOne();
  stepCount++;
  
  const state = cpu.getState();
  
  // When we reach the loop, manually break it by setting E to 0
  if (state.pc === 0x036A && state.e !== 0) {
    console.log(`Breaking loop at step ${stepCount}: PC=${state.pc.toString(16).padStart(4, '0')}, E=${state.e.toString(16).padStart(2, '0')}`);
    // Manually set E to 0 to break the loop
    cpu.setState({ ...state, e: 0 });
    console.log(`Set E to 0, continuing execution...`);
  }
  
  // Log progress
  if (stepCount % 10 === 0 || state.pc !== lastPC) {
    console.log(`Step ${stepCount}: PC=${state.pc.toString(16).padStart(4, '0')}, A=${state.a.toString(16).padStart(2, '0')}, B=${state.b.toString(16).padStart(2, '0')}, C=${state.c.toString(16).padStart(2, '0')}, D=${state.d.toString(16).padStart(2, '0')}, E=${state.e.toString(16).padStart(2, '0')}, H=${state.h.toString(16).padStart(2, '0')}, L=${state.l.toString(16).padStart(2, '0')}, SP=${state.sp.toString(16).padStart(4, '0')}`);
  }
  
  lastPC = state.pc;
  
  // Stop if we've made significant progress
  if (stepCount > 50 && state.pc > 0x0400) {
    console.log(`BIOS made progress beyond loop, stopping at PC ${state.pc.toString(16).padStart(4, '0')}`);
    break;
  }
}

console.log('BIOS loop break test completed');



