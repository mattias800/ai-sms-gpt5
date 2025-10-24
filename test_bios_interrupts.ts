#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SmsBus } from './src/bus/bus.js';
import { createVDP } from './src/vdp/vdp.js';
import { createPSG } from './src/psg/sn76489.js';
import { readFileSync } from 'node:fs';

// Test BIOS with interrupts enabled
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

console.log('Testing BIOS with interrupts...');

// Reset CPU
cpu.reset();

// Enable interrupts
cpu.setState({ ...cpu.getState(), iff1: true, iff2: true });

// Run until we get to the problematic loop
let stepCount = 0;
let interruptCount = 0;

while (stepCount < 200) {
  const result = cpu.stepOne();
  stepCount++;
  
  if (result.irqAccepted) {
    interruptCount++;
    console.log(`Step ${stepCount}: IRQ accepted (${interruptCount})`);
  }
  
  const state = cpu.getState();
  
  // Log when we reach the problematic area
  if (state.pc >= 0x0360 && state.pc <= 0x0380) {
    console.log(`Step ${stepCount}: PC=${state.pc.toString(16).padStart(4, '0')}, A=${state.a.toString(16).padStart(2, '0')}, B=${state.b.toString(16).padStart(2, '0')}, C=${state.c.toString(16).padStart(2, '0')}, D=${state.d.toString(16).padStart(2, '0')}, E=${state.e.toString(16).padStart(2, '0')}, H=${state.h.toString(16).padStart(2, '0')}, L=${state.l.toString(16).padStart(2, '0')}, SP=${state.sp.toString(16).padStart(4, '0')}, interrupts=${interruptCount}`);
  }
  
  // Stop if we're stuck in the loop
  if (stepCount > 100 && state.pc >= 0x0360 && state.pc <= 0x0380) {
    console.log(`Stuck in loop at PC ${state.pc.toString(16).padStart(4, '0')}, stopping`);
    break;
  }
}

console.log(`Total interrupts: ${interruptCount}`);
console.log('BIOS interrupts test completed');



