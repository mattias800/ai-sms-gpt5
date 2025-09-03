#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { createCanvas } from 'canvas';
import { Machine } from '../dist/src/machine/machine.js';
import { Bus } from '../dist/src/bus/bus.js';

// Load ROM
const romPath = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = readFileSync(romPath);

console.log('=== Running Alex Kidd for 10 seconds (600 frames) ===');
console.log(`ROM size: ${rom.length} bytes (${Math.floor(rom.length / 1024)}KB)\n`);

// Create machine
const machine = new Machine();
machine.reset();

// Load ROM into bus
const bus = machine.bus;
for (let i = 0; i < rom.length && i < 0xC000; i++) {
    if (i < 0x4000) {
        bus.rom0[i] = rom[i];
    } else if (i < 0x8000) {
        bus.rom1[i - 0x4000] = rom[i];
    } else {
        bus.rom2[i - 0x8000] = rom[i];
    }
}

// Store full ROM for banking
bus.fullRom = rom;

// Run for 10 seconds (600 frames at 60fps)
const totalFrames = 600;
const cyclesPerFrame = 59736;
let frameCount = 0;
let lastVramWrites = 0;
let captureFrameNumber = -1;
let displayWasOn = false;

console.log('Running emulation...');
while (frameCount < totalFrames) {
    // Run one frame worth of cycles
    let cycles = 0;
    while (cycles < cyclesPerFrame) {
        const stepCycles = machine.step();
        cycles += stepCycles;
    }
    
    frameCount++;
    
    // Check display status
    const vdp = machine.vdp;
    const displayEnabled = (vdp.registers[1] & 0x40) !== 0;
    
    // Capture a frame when display is on (preferably around frame 420)
    if (displayEnabled && captureFrameNumber === -1 && frameCount >= 400) {
        captureFrameNumber = frameCount;
        displayWasOn = true;
    }
    
    // Progress update every second (60 frames)
    if (frameCount % 60 === 0) {
        const seconds = frameCount / 60;
        const vramWrites = vdp.debugCounters.vramWrites;
        const newWrites = vramWrites - lastVramWrites;
        lastVramWrites = vramWrites;
        
        console.log(`${seconds}s: Frame ${frameCount}, PC=0x${machine.cpu.PC.toString(16).padStart(4, '0')}, ` +
                    `VRAM writes: ${newWrites}, Display: ${displayEnabled}`);
    }
}

// If display was never on during preferred range, just capture the last frame
if (captureFrameNumber === -1) {
    captureFrameNumber = totalFrames;
}

console.log(`\nCapturing frame ${captureFrameNumber}...`);

// Generate final frame PNG
const width = 256;
const height = 192;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');
const imageData = ctx.createImageData(width, height);

// Get screen data from VDP
const vdp = machine.vdp;
const nameTable = (vdp.registers[2] & 0x0E) << 10;
const patternBase = 0x0000; // Alex Kidd uses 0x0000 for patterns

// Render the screen
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        
        // Get tile from name table
        const tileX = Math.floor(x / 8);
        const tileY = Math.floor(y / 8);
        const nameAddr = nameTable + (tileY * 32 + tileX) * 2;
        const tileIndex = vdp.VRAM[nameAddr] | ((vdp.VRAM[nameAddr + 1] & 0x01) << 8);
        
        // Get pattern data
        const pixelInTileX = x % 8;
        const pixelInTileY = y % 8;
        const patternAddr = patternBase + tileIndex * 32 + pixelInTileY * 4;
        
        // Get color from pattern
        const plane0 = vdp.VRAM[patternAddr];
        const plane1 = vdp.VRAM[patternAddr + 1];
        const plane2 = vdp.VRAM[patternAddr + 2];
        const plane3 = vdp.VRAM[patternAddr + 3];
        
        const bit = 7 - pixelInTileX;
        const colorIndex = ((plane0 >> bit) & 1) |
                          (((plane1 >> bit) & 1) << 1) |
                          (((plane2 >> bit) & 1) << 2) |
                          (((plane3 >> bit) & 1) << 3);
        
        // Get color from CRAM (SMS uses 6-bit color: 2 bits per RGB channel)
        const cramIndex = colorIndex;
        const color = vdp.CRAM[cramIndex];
        
        const r = ((color >> 0) & 0x03) * 85;
        const g = ((color >> 2) & 0x03) * 85;
        const b = ((color >> 4) & 0x03) * 85;
        
        imageData.data[pixelIndex] = r;
        imageData.data[pixelIndex + 1] = g;
        imageData.data[pixelIndex + 2] = b;
        imageData.data[pixelIndex + 3] = 255;
    }
}

ctx.putImageData(imageData, 0, 0);

// Save PNG
const outputPath = 'alex_kidd_10sec.png';
const buffer = canvas.toBuffer('image/png');
writeFileSync(outputPath, buffer);

console.log(`\n✅ Saved screenshot to ${outputPath}`);

// Print final statistics
console.log('\n=== Final Statistics ===');
console.log(`Total frames: ${frameCount}`);
console.log(`Captured frame: ${captureFrameNumber}`);
console.log(`Final PC: 0x${machine.cpu.PC.toString(16).padStart(4, '0')}`);
console.log(`Display enabled: ${(vdp.registers[1] & 0x40) !== 0}`);
console.log(`VRAM writes: ${vdp.debugCounters.vramWrites}`);
console.log(`CRAM writes: ${vdp.debugCounters.cramWrites}`);

// Count non-zero VRAM
let nonZero = 0;
for (let i = 0; i < vdp.VRAM.length; i++) {
    if (vdp.VRAM[i] !== 0) nonZero++;
}
console.log(`Non-zero VRAM bytes: ${nonZero}/${vdp.VRAM.length}`);
