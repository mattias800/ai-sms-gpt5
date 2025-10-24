#!/usr/bin/env tsx

import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'node:fs';

console.log('Simulating Wonderboy web interface...');

// Load Wonderboy ROM
const romData = readFileSync('wonderboy5.sms');
const cart = { rom: new Uint8Array(romData) };

// Create machine with manual initialization (like the web interface would)
const machine = createMachine({ 
  cart,
  useManualInit: true // This enables our manual SMS initialization
});

console.log('Machine created with manual initialization');

// Get VDP and run for a bit to let Wonderboy initialize
const vdp = machine.getVDP();
const cpu = machine.getCPU();

console.log('Running Wonderboy for initialization...');

// Run for a reasonable number of cycles to let Wonderboy initialize
machine.runCycles(100000); // Run 100,000 cycles

console.log(`CPU PC: 0x${cpu.getState().pc.toString(16).padStart(4, '0')}`);

// Check VDP state
const vdpState = vdp.getState?.();
if (vdpState) {
  console.log(`VDP display enabled: ${vdpState.displayEnabled}`);
  console.log(`VDP line: ${vdpState.line}`);
  console.log(`VDP cycles per line: ${vdpState.cyclesPerLine}`);
}

// Try to render a frame (like the web interface does)
console.log('Attempting to render frame...');
const frameBuffer = vdp.renderFrame?.();
if (frameBuffer) {
  console.log(`Frame buffer size: ${frameBuffer.length} bytes`);
  
  // Check for non-zero pixels
  let nonZeroPixels = 0;
  let maxValue = 0;
  for (let i = 0; i < frameBuffer.length; i++) {
    if (frameBuffer[i] !== 0) {
      nonZeroPixels++;
      if (frameBuffer[i] > maxValue) {
        maxValue = frameBuffer[i];
      }
    }
  }
  
  console.log(`Non-zero pixels: ${nonZeroPixels}`);
  console.log(`Max pixel value: ${maxValue}`);
  
  if (nonZeroPixels > 0) {
    console.log('✅ Wonderboy is producing visual output!');
  } else {
    console.log('❌ Wonderboy frame is still black - may need more initialization time');
  }
} else {
  console.log('❌ renderFrame returned null/undefined');
}

// Run a bit more to see if we get visual output
console.log('Running more cycles to see if visual output appears...');
machine.runCycles(500000); // Run 500,000 more cycles

console.log(`CPU PC after more steps: 0x${cpu.getState().pc.toString(16).padStart(4, '0')}`);

// Try rendering again
const frameBuffer2 = vdp.renderFrame?.();
if (frameBuffer2) {
  let nonZeroPixels2 = 0;
  for (let i = 0; i < frameBuffer2.length; i++) {
    if (frameBuffer2[i] !== 0) {
      nonZeroPixels2++;
    }
  }
  
  console.log(`Non-zero pixels after more steps: ${nonZeroPixels2}`);
  
  if (nonZeroPixels2 > 0) {
    console.log('✅ Wonderboy is now producing visual output!');
  } else {
    console.log('❌ Wonderboy frame is still black');
  }
}

console.log('Web simulation test completed');
