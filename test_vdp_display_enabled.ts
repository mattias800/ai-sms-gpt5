#!/usr/bin/env tsx

import { createVDP } from './src/vdp/vdp.js';
import { initializeSMS } from './src/machine/sms_init.js';

console.log('Testing VDP display enable...');

const vdp = createVDP();

// Initialize VDP with our manual initialization
console.log('Initializing VDP...');
vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x80); // Register 0

vdp.writePort(0xBF, 0x60); // Value (display enable + VBlank IRQ)
vdp.writePort(0xBF, 0x81); // Register 1

vdp.writePort(0xBF, 0x38); // Value
vdp.writePort(0xBF, 0x82); // Register 2

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x83); // Register 3

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x84); // Register 4

vdp.writePort(0xBF, 0x7E); // Value
vdp.writePort(0xBF, 0x85); // Register 5

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x86); // Register 6

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x87); // Register 7

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x88); // Register 8

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x89); // Register 9

vdp.writePort(0xBF, 0xFF); // Value
vdp.writePort(0xBF, 0x8A); // Register 10

console.log('VDP initialized');

// Check register 1 value
const reg1 = vdp.getRegister?.(1);
console.log(`Register 1 value: 0x${reg1?.toString(16).padStart(2, '0')}`);

// Check if display is enabled
const displayEnabled = (reg1 ?? 0) & 0x40;
console.log(`Display enabled (bit 6): ${displayEnabled !== 0}`);

// Check VDP state
const state = vdp.getState?.();
if (state) {
  console.log(`VDP state displayEnabled: ${state.displayEnabled}`);
}

// Try to render a frame
console.log('Attempting to render frame...');
const frameBuffer = vdp.renderFrame?.();
if (frameBuffer) {
  console.log(`Frame buffer size: ${frameBuffer.length} bytes`);
  
  // Check if frame is all black (all zeros)
  let nonZeroPixels = 0;
  for (let i = 0; i < frameBuffer.length; i++) {
    if (frameBuffer[i] !== 0) {
      nonZeroPixels++;
    }
  }
  console.log(`Non-zero pixels: ${nonZeroPixels}`);
  
  if (nonZeroPixels === 0) {
    console.log('Frame is completely black - this is expected for an uninitialized VDP');
  } else {
    console.log('Frame has some content!');
  }
} else {
  console.log('renderFrame returned null/undefined');
}

console.log('VDP display test completed');



