#!/usr/bin/env tsx

import { createVDP } from './src/vdp/vdp.js';

console.log('Testing VDP with manual VRAM setup...');

const vdp = createVDP();

// Initialize VDP with display enabled
console.log('Setting up VDP...');
vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x80); // Register 0

vdp.writePort(0xBF, 0x60); // Value (display enable + VBlank IRQ)
vdp.writePort(0xBF, 0x81); // Register 1

vdp.writePort(0xBF, 0x38); // Value (name table at 0x3800)
vdp.writePort(0xBF, 0x82); // Register 2

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x83); // Register 3

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x84); // Register 4

vdp.writePort(0xBF, 0x7E); // Value
vdp.writePort(0xBF, 0x85); // Register 5

vdp.writePort(0xBF, 0x00); // Value
vdp.writePort(0xBF, 0x86); // Register 6

vdp.writePort(0xBF, 0x00); // Value (black background)
vdp.writePort(0xBF, 0x87); // Register 7

console.log('VDP initialized');

// Check display enable
const reg1 = vdp.getRegister?.(1);
console.log(`Register 1: 0x${reg1?.toString(16).padStart(2, '0')}`);
console.log(`Display enabled: ${(reg1 ?? 0) & 0x40 ? 'YES' : 'NO'}`);

// Try to set up some basic VRAM data
console.log('Setting up VRAM data...');

// Set up VRAM address for name table (0x3800)
vdp.writePort(0xBF, 0x00); // Low byte of address
vdp.writePort(0xBF, 0x38); // High byte of address (0x38 = name table write)

// Write some tile data to name table
for (let i = 0; i < 32; i++) {
  vdp.writePort(0xBE, 0x01); // Tile 1
}

// Set up VRAM address for pattern table (0x0000)
vdp.writePort(0xBF, 0x00); // Low byte of address
vdp.writePort(0xBF, 0x00); // High byte of address (0x00 = pattern table write)

// Write a simple pattern (8x8 tile with some pixels)
const pattern = [
  0xFF, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0xFF, // Border
  0xFF, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0xFF, // Border
];

for (const byte of pattern) {
  vdp.writePort(0xBE, byte);
}

// Set up color data
vdp.writePort(0xBF, 0x00); // Low byte of address
vdp.writePort(0xBF, 0xC0); // High byte of address (0xC0 = color table write)

// Write color data (white on black)
for (let i = 0; i < 32; i++) {
  vdp.writePort(0xBE, 0xF0); // White foreground, black background
}

console.log('VRAM data written');

// Try to render a frame
console.log('Rendering frame...');
const frameBuffer = vdp.renderFrame?.();
if (frameBuffer) {
  console.log(`Frame buffer size: ${frameBuffer.length} bytes`);
  
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
    console.log('🎨 SUCCESS! VDP is producing visual output!');
  } else {
    console.log('❌ Still no visual output - VDP may need different setup');
  }
} else {
  console.log('❌ renderFrame returned null/undefined');
}

console.log('VDP manual setup test completed');



