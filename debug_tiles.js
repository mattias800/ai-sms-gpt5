#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from './dist/src/machine/machine.js';
import { createCanvas } from 'canvas';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

console.log('=== Debugging Tile Rendering ===\n');

// Run for 420 frames
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 420; frame++) {
  m.runCycles(cyclesPerFrame);
}

const vdp = m.getVDP();
const vdpState = vdp.getState ? vdp.getState() : undefined;

if (vdpState) {
  const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
  const patternBase = 0x0000;
  
  console.log(`Name table base: 0x${nameBase.toString(16)}`);
  console.log(`Pattern base: 0x${patternBase.toString(16)}\n`);
  
  // Check first few tiles in detail
  console.log('=== First 5 tiles in name table ===');
  for (let i = 0; i < 5; i++) {
    const nameAddr = nameBase + i * 2;
    const low = vdpState.vram[nameAddr];
    const high = vdpState.vram[nameAddr + 1];
    
    // Parse name table entry
    const tileIndex = low | ((high & 0x01) << 8);  // 9-bit tile index
    const hFlip = (high & 0x02) !== 0;
    const vFlip = (high & 0x04) !== 0;
    const palette = (high & 0x08) ? 1 : 0;  // 0 or 1
    const priority = (high & 0x10) !== 0;
    
    console.log(`\nTile ${i}:`);
    console.log(`  Name table entry: 0x${low.toString(16).padStart(2,'0')} 0x${high.toString(16).padStart(2,'0')}`);
    console.log(`  Tile index: ${tileIndex} (0x${tileIndex.toString(16)})`);
    console.log(`  H-Flip: ${hFlip}, V-Flip: ${vFlip}`);
    console.log(`  Palette: ${palette}, Priority: ${priority}`);
    
    if (tileIndex !== 0) {
      // Show pattern data for this tile
      const patternAddr = patternBase + tileIndex * 32;
      console.log(`  Pattern at 0x${patternAddr.toString(16)}:`);
      
      // Show first 2 rows of tile data
      for (let row = 0; row < 2; row++) {
        const addr = patternAddr + row * 4;
        const b0 = vdpState.vram[addr];
        const b1 = vdpState.vram[addr + 1];
        const b2 = vdpState.vram[addr + 2];
        const b3 = vdpState.vram[addr + 3];
        console.log(`    Row ${row}: ${b0.toString(16).padStart(2,'0')} ${b1.toString(16).padStart(2,'0')} ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')}`);
      }
    }
  }
  
  // Check CRAM palettes
  console.log('\n=== Color Palettes ===');
  console.log('Palette 0 (BG):');
  for (let i = 0; i < 16; i++) {
    const color = vdpState.cram[i];
    const r = (color & 0x03);
    const g = ((color >> 2) & 0x03);
    const b = ((color >> 4) & 0x03);
    if (color !== 0) {
      console.log(`  Color ${i}: 0x${color.toString(16).padStart(2,'0')} (R:${r} G:${g} B:${b})`);
    }
  }
  
  console.log('\nPalette 1 (Sprites):');
  for (let i = 16; i < 32; i++) {
    const color = vdpState.cram[i];
    const r = (color & 0x03);
    const g = ((color >> 2) & 0x03);
    const b = ((color >> 4) & 0x03);
    if (color !== 0) {
      console.log(`  Color ${i}: 0x${color.toString(16).padStart(2,'0')} (R:${r} G:${g} B:${b})`);
    }
  }
  
  // Create a debug image showing individual tiles
  console.log('\n=== Creating debug tile image ===');
  const width = 256;
  const height = 64;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  
  // Draw first 32 tiles in a row
  for (let tileNum = 0; tileNum < 32; tileNum++) {
    const tileIndex = tileNum + 1; // Start from tile 1
    const patternAddr = patternBase + tileIndex * 32;
    
    for (let row = 0; row < 8; row++) {
      const addr = patternAddr + row * 4;
      const b0 = vdpState.vram[addr] || 0;
      const b1 = vdpState.vram[addr + 1] || 0;
      const b2 = vdpState.vram[addr + 2] || 0;
      const b3 = vdpState.vram[addr + 3] || 0;
      
      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        const colorIndex = ((b0 >> bit) & 1) |
                          (((b1 >> bit) & 1) << 1) |
                          (((b2 >> bit) & 1) << 2) |
                          (((b3 >> bit) & 1) << 3);
        
        const cramColor = vdpState.cram[colorIndex] || 0;
        const r = (cramColor & 0x03) * 85;
        const g = ((cramColor >> 2) & 0x03) * 85;
        const b = ((cramColor >> 4) & 0x03) * 85;
        
        const x = (tileNum % 32) * 8 + col;
        const y = Math.floor(tileNum / 32) * 8 + row;
        
        if (x < width && y < height) {
          const pixelIndex = (y * width + x) * 4;
          imageData.data[pixelIndex] = r;
          imageData.data[pixelIndex + 1] = g;
          imageData.data[pixelIndex + 2] = b;
          imageData.data[pixelIndex + 3] = 255;
        }
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  const buffer = canvas.toBuffer('image/png');
  writeFileSync('debug_tiles.png', buffer);
  console.log('Wrote debug_tiles.png showing first 32 tiles');
  
  // Check VDP registers
  console.log('\n=== VDP Registers ===');
  console.log(`R0 (Mode Control 1): 0x${vdpState.regs[0].toString(16)}`);
  console.log(`R1 (Mode Control 2): 0x${vdpState.regs[1].toString(16)}`);
  console.log(`R2 (Name Table): 0x${vdpState.regs[2].toString(16)} -> base 0x${nameBase.toString(16)}`);
  console.log(`R3 (Color Table): 0x${vdpState.regs[3].toString(16)}`);
  console.log(`R4 (Pattern Table): 0x${vdpState.regs[4].toString(16)}`);
  console.log(`R5 (Sprite Attr): 0x${vdpState.regs[5].toString(16)}`);
  console.log(`R6 (Sprite Pattern): 0x${vdpState.regs[6].toString(16)}`);
  console.log(`R7 (Border Color): 0x${vdpState.regs[7].toString(16)}`);
}
