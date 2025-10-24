#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SimpleBus } from './src/bus/bus.js';

// Test CPU interrupt acceptance
const bus = new SimpleBus();
const cpu = createZ80({
  bus,
  experimentalFastBlockOps: true,
});

// Set up a simple program
bus.write8(0x0000, 0xed); // ED prefix
bus.write8(0x0001, 0x56); // IM 1
bus.write8(0x0002, 0xfb); // EI
bus.write8(0x0003, 0x76); // HALT

// Set up interrupt handler at address 0x0038 (IM 1)
bus.write8(0x0038, 0xfb); // EI
bus.write8(0x0039, 0xc9); // RET

console.log('Testing CPU interrupt acceptance...');

// Reset CPU
cpu.reset();

// Run until CPU halts
let stepCount = 0;
while (stepCount < 100) {
  const result = cpu.stepOne();
  stepCount++;
  
  console.log(`Step ${stepCount}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, halted=${cpu.getState().halted}, irqAccepted=${result.irqAccepted}`);
  
  if (cpu.getState().halted) {
    console.log('CPU halted, requesting interrupt...');
    cpu.requestIRQ();
    
    // Run a few more steps to see interrupt handling
    for (let i = 0; i < 5; i++) {
      const result = cpu.stepOne();
      stepCount++;
      console.log(`Step ${stepCount}: PC=${cpu.getState().pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}, halted=${cpu.getState().halted}, irqAccepted=${result.irqAccepted}`);
    }
    break;
  }
}

console.log('CPU interrupt acceptance test completed');


