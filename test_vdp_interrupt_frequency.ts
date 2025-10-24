#!/usr/bin/env tsx

import { createVDP } from './src/vdp/vdp.js';

// Test VDP interrupt frequency
const vdp = createVDP();

console.log('Testing VDP interrupt frequency...');

// Enable VBlank interrupts (bit 5 of register 1)
vdp.writePort(0xBF, 0x20); // Value 0x20
vdp.writePort(0xBF, 0x81); // Code 0x02 (register write) + register index 0x01

console.log(`VBlank interrupts enabled: ${(vdp.getRegister(1) & 0x20) !== 0}`);

// Count interrupts over multiple frames
let interruptCount = 0;
let frameCount = 0;
const cyclesPerFrame = 262 * 228; // linesPerFrame * cyclesPerLine

console.log(`Cycles per frame: ${cyclesPerFrame}`);

// Run for 5 frames
for (let frame = 0; frame < 5; frame++) {
  let frameInterrupts = 0;
  
  for (let cycle = 0; cycle < cyclesPerFrame; cycle++) {
    vdp.tickCycles(1);
    
    if (vdp.hasIRQ()) {
      frameInterrupts++;
      interruptCount++;
      
      // Read status to clear interrupt
      const status = vdp.readPort(0xBF);
      console.log(`Frame ${frame}, Cycle ${cycle}: IRQ detected, status=0x${status.toString(16)}`);
    }
  }
  
  frameCount++;
  console.log(`Frame ${frame}: ${frameInterrupts} interrupts`);
}

console.log(`Total interrupts over ${frameCount} frames: ${interruptCount}`);
console.log(`Average interrupts per frame: ${interruptCount / frameCount}`);

console.log('VDP interrupt frequency test completed');


