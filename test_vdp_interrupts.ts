#!/usr/bin/env tsx

import { createVDP } from './src/vdp/vdp.js';

// Test VDP interrupt generation
const vdp = createVDP();

console.log('Testing VDP interrupt generation...');

// Enable VBlank interrupts (bit 5 of register 1)
// First write: register value (0x20 = VBlank IRQ enable) in low byte
vdp.writePort(0xBF, 0x20); // Value 0x20
// Second write: register index (1) in high byte with code 0x02
vdp.writePort(0xBF, 0x81); // Code 0x02 (register write) + register index 0x01

console.log(`Initial IRQ state: ${vdp.hasIRQ()}`);

// Tick the VDP for enough cycles to reach VBlank (192 lines * 228 cycles/line = 43776 cycles)
const totalCycles = 200 * 228; // A bit more to ensure we reach VBlank
console.log(`Ticking VDP for ${totalCycles} cycles to reach VBlank...`);

for (let i = 0; i < totalCycles; i++) {
  vdp.tickCycles(1);
  
  if (i % 10000 === 0) {
    const state = vdp.getState();
    console.log(`Cycle ${i}: line=${state.line}, IRQ=${vdp.hasIRQ()}, vblankStartLine=${state.vblankStartLine}`);
  }
  
  // Read status to clear interrupt
  if (vdp.hasIRQ()) {
    const status = vdp.readPort(0xBF);
    const state = vdp.getState();
    console.log(`IRQ detected at cycle ${i}, line=${state.line}, status=0x${status.toString(16)}`);
  }
}

console.log('VDP interrupt test completed');
