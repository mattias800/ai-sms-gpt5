#!/usr/bin/env tsx

import { createVDP } from './src/vdp/vdp.js';

// Test VDP line advancement in detail
const vdp = createVDP();

console.log('Testing VDP line advancement in detail...');

// Enable VBlank interrupts (bit 5 of register 1)
vdp.writePort(0xBF, 0x01); // Register 1
vdp.writePort(0xBF, 0x82); // Code 0x02 (register write) + value 0x20

const state = vdp.getState();
console.log(`Initial state: line=${state.line}, cyclesPerLine=${state.cyclesPerLine}, vblankStartLine=${state.vblankStartLine}`);

// Test line advancement by ticking exactly one line worth of cycles
console.log('Testing single line advancement...');
vdp.tickCycles(state.cyclesPerLine);
const stateAfterLine = vdp.getState();
console.log(`After ${state.cyclesPerLine} cycles: line=${stateAfterLine.line}`);

// Test multiple lines
console.log('Testing multiple line advancement...');
for (let line = 0; line < 10; line++) {
  vdp.tickCycles(state.cyclesPerLine);
  const currentState = vdp.getState();
  console.log(`Line ${line + 1}: line=${currentState.line}`);
}

// Test reaching VBlank
console.log('Testing VBlank reach...');
const cyclesToVBlank = state.vblankStartLine * state.cyclesPerLine;
console.log(`Cycles needed to reach VBlank: ${cyclesToVBlank}`);
vdp.tickCycles(cyclesToVBlank);
const vblankState = vdp.getState();
console.log(`After ${cyclesToVBlank} cycles: line=${vblankState.line}, IRQ=${vdp.hasIRQ()}`);
console.log(`Register 1 value: 0x${vdp.getRegister(1)?.toString(16)}`);
console.log(`VBlank IRQ enabled: ${(vdp.getRegister(1) & 0x20) !== 0}`);

console.log('VDP detailed test completed');
