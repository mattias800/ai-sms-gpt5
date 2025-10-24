#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SimpleBus } from './src/bus/bus.js';

// Test DJNZ instruction
const bus = new SimpleBus();
const cpu = createZ80({
  bus,
  experimentalFastBlockOps: true,
});

// Load a simple test program: DJNZ loop
bus.write8(0x0000, 0x06); // LD B,5
bus.write8(0x0001, 0x05); // B = 5
bus.write8(0x0002, 0x10); // DJNZ -2 (jump back 2 bytes)
bus.write8(0x0003, 0xfe); // -2
bus.write8(0x0004, 0x76); // HALT

console.log('Testing DJNZ instruction...');

// Reset CPU
cpu.reset();

// Run the loop
for (let i = 0; i < 20; i++) {
  const result = cpu.stepOne();
  const state = cpu.getState();
  console.log(`Step ${i}: PC=${state.pc.toString(16).padStart(4, '0')}, B=${state.b.toString(16).padStart(2, '0')}, cycles=${result.cycles}, halted=${state.halted}`);
  
  if (state.halted) {
    console.log('CPU halted as expected');
    break;
  }
}

console.log('DJNZ test completed');



