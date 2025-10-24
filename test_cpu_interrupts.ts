#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SimpleBus } from './src/bus/bus.js';

// Test CPU interrupt handling
const bus = new SimpleBus();
const cpu = createZ80({
  bus,
  experimentalFastBlockOps: true,
});

// Load a simple test program: NOP, HALT
bus.write8(0x0000, 0x00); // NOP
bus.write8(0x0001, 0x76); // HALT

// Set up interrupt handler at address 0x0038 (IM 1)
bus.write8(0x0038, 0xfb); // EI (enable interrupts)
bus.write8(0x0039, 0xc9); // RET (return from interrupt)

console.log('Testing CPU interrupt handling...');

// Reset CPU
cpu.reset();

// Set interrupt mode 1
bus.write8(0x0000, 0xed); // ED prefix
bus.write8(0x0001, 0x56); // IM 1

// Run a few steps to set up interrupt mode
for (let i = 0; i < 5; i++) {
  const result = cpu.stepOne();
  console.log(`Step ${i}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, halted=${cpu.getState().halted}`);
}

// Request an interrupt
console.log('Requesting interrupt...');
cpu.requestIRQ();

// Run a few more steps
for (let i = 5; i < 10; i++) {
  const result = cpu.stepOne();
  console.log(`Step ${i}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, halted=${cpu.getState().halted}, irqAccepted=${result.irqAccepted}`);
}

console.log('CPU interrupt test completed');


