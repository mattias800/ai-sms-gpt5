#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createMachine } from './dist/src/machine/machine.js';

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
  
  console.log(`Name table base: 0x${nameBase.toString(16)}`);
  console.log(`R4 register: 0x${vdpState.regs[4].toString(16)}`);
  console.log(`Pattern base from R4: 0x${((vdpState.regs[4] & 0x07) << 11).toString(16)}`);
  console.log(`Actual pattern base used: 0x0000 (hardcoded)\n`);
  
  // Check first few tiles in detail
  console.log('=== First 10 name table entries ===');
  for (let i = 0; i < 10; i++) {
    const nameAddr = nameBase + i * 2;
    const low = vdpState.vram[nameAddr];
    const high = vdpState.vram[nameAddr + 1];
    
    // Parse name table entry properly
    // Format: PPVHNTTT TTTTTTTT
    // P = Priority, V = V-flip, H = H-flip, N = Palette, T = Tile index (9 bits)
    const tileIndex = low | ((high & 0x01) << 8);  // 9-bit tile index
    const hFlip = (high & 0x02) !== 0;
    const vFlip = (high & 0x04) !== 0;
    const palette = (high & 0x08) ? 1 : 0;
    const priority = (high & 0x10) !== 0;
    
    console.log(`Entry ${i}: 0x${low.toString(16).padStart(2,'0')}${high.toString(16).padStart(2,'0')} -> Tile:${tileIndex.toString().padStart(3)} Pal:${palette} H:${hFlip?1:0} V:${vFlip?1:0} Pri:${priority?1:0}`);
  }
  
  // Check what pattern data looks like for the first non-zero tile
  console.log('\n=== Pattern data for first few tiles ===');
  const tileIndices = [1, 6, 7, 8, 9]; // Common tile indices from debug output
  
  for (const tileIndex of tileIndices) {
    const patternAddr = tileIndex * 32;
    console.log(`\nTile ${tileIndex} pattern at 0x${patternAddr.toString(16)}:`);
    
    // Check if there's data there
    let hasData = false;
    for (let i = 0; i < 32; i++) {
      if (vdpState.vram[patternAddr + i] !== 0) {
        hasData = true;
        break;
      }
    }
    
    if (hasData) {
      // Show first 2 rows
      for (let row = 0; row < 2; row++) {
        const addr = patternAddr + row * 4;
        const b0 = vdpState.vram[addr];
        const b1 = vdpState.vram[addr + 1];
        const b2 = vdpState.vram[addr + 2];
        const b3 = vdpState.vram[addr + 3];
        
        // Decode the row to show pixel values
        let pixels = '';
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const pixel = ((b0 >> bit) & 1) |
                       (((b1 >> bit) & 1) << 1) |
                       (((b2 >> bit) & 1) << 2) |
                       (((b3 >> bit) & 1) << 3);
          pixels += pixel.toString(16);
        }
        
        console.log(`  Row ${row}: ${b0.toString(16).padStart(2,'0')} ${b1.toString(16).padStart(2,'0')} ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')} -> pixels: ${pixels}`);
      }
    } else {
      console.log('  (empty)');
    }
  }
  
  // Check CRAM
  console.log('\n=== CRAM Palette (first 16 colors) ===');
  for (let i = 0; i < 16; i++) {
    const color = vdpState.cram[i];
    if (color !== 0) {
      const r = (color & 0x03);
      const g = ((color >> 2) & 0x03);
      const b = ((color >> 4) & 0x03);
      console.log(`Color ${i.toString().padStart(2)}: 0x${color.toString(16).padStart(2,'0')} -> R:${r} G:${g} B:${b}`);
    }
  }
  
  // Check if name table has valid tile references
  console.log('\n=== Name table statistics ===');
  const tileMap = new Map();
  for (let i = 0; i < 768; i++) {
    const addr = nameBase + i * 2;
    const low = vdpState.vram[addr];
    const high = vdpState.vram[addr + 1];
    const tileIndex = low | ((high & 0x01) << 8);
    
    if (!tileMap.has(tileIndex)) {
      tileMap.set(tileIndex, 0);
    }
    tileMap.set(tileIndex, tileMap.get(tileIndex) + 1);
  }
  
  console.log(`Unique tiles used: ${tileMap.size}`);
  console.log('Most common tiles:');
  const sorted = Array.from(tileMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [tile, count] of sorted) {
    console.log(`  Tile ${tile}: used ${count} times`);
  }
  
  // Check VDP mode
  console.log('\n=== VDP Mode ===');
  const r0 = vdpState.regs[0];
  const r1 = vdpState.regs[1];
  console.log(`Mode bits: M1=${(r1 & 0x10) ? 1 : 0} M2=${(r1 & 0x08) ? 1 : 0} M3=${(r0 & 0x02) ? 1 : 0} M4=${(r0 & 0x04) ? 1 : 0}`);
  
  // Determine mode
  const m1 = (r1 & 0x10) !== 0;
  const m2 = (r1 & 0x08) !== 0;
  const m3 = (r0 & 0x02) !== 0;
  const m4 = (r0 & 0x04) !== 0;
  
  if (!m1 && !m2 && !m3 && m4) {
    console.log('Mode: Mode 4 (Master System)');
  } else if (!m1 && !m2 && !m3 && !m4) {
    console.log('Mode: TMS9918 Graphics I');
  } else {
    console.log('Mode: Unknown/Invalid');
  }
}
