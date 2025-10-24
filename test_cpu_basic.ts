#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SimpleBus } from './src/bus/bus.js';

// Simple test to verify CPU basic functionality
const bus = new SimpleBus();
const cpu = createZ80({
  bus,
  experimentalFastBlockOps: true,
});

// Load a simple test program: NOP, HALT
bus.write8(0x0000, 0x00); // NOP
bus.write8(0x0001, 0x76); // HALT

console.log('Testing basic CPU functionality...');

// Reset CPU
cpu.reset();

// Run a few steps
for (let i = 0; i < 10; i++) {
  const result = cpu.stepOne();
  console.log(`Step ${i}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, halted=${cpu.getState().halted}`);
  
  if (cpu.getState().halted) {
    console.log('CPU halted as expected');
    break;
  }
}

console.log('Basic CPU test completed');
