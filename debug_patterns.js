#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createMachine } from './dist/src/machine/machine.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

console.log('=== Checking pattern locations ===\n');

// Run for 420 frames
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 420; frame++) {
  m.runCycles(cyclesPerFrame);
}

const vdp = m.getVDP();
const vdpState = vdp.getState ? vdp.getState() : undefined;

if (vdpState) {
  // Check multiple possible pattern locations
  const locations = [0x0000, 0x2000, 0x3800];
  
  for (const loc of locations) {
    console.log(`\n=== Checking patterns at 0x${loc.toString(16)} ===`);
    let nonZeroBytes = 0;
    let firstNonZero = -1;
    
    // Check 2KB of pattern data
    for (let i = 0; i < 2048; i++) {
      if (vdpState.vram[loc + i] !== 0) {
        nonZeroBytes++;
        if (firstNonZero === -1) firstNonZero = loc + i;
      }
    }
    
    console.log(`Non-zero bytes: ${nonZeroBytes}/2048`);
    if (firstNonZero !== -1) {
      console.log(`First non-zero at: 0x${firstNonZero.toString(16)}`);
      
      // Show first tile pattern (32 bytes)
      console.log('First tile pattern data:');
      for (let i = 0; i < 32; i += 4) {
        const b0 = vdpState.vram[loc + i];
        const b1 = vdpState.vram[loc + i + 1];
        const b2 = vdpState.vram[loc + i + 2];
        const b3 = vdpState.vram[loc + i + 3];
        console.log(`  Row ${i/4}: ${b0.toString(16).padStart(2,'0')} ${b1.toString(16).padStart(2,'0')} ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')}`);
      }
    }
  }
  
  // Check what tiles are referenced in name table
  const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
  console.log(`\n=== Name table at 0x${nameBase.toString(16)} ===`);
  
  const tileIndices = new Set();
  for (let i = 0; i < 768 * 2; i += 2) {
    const addr = nameBase + i;
    const low = vdpState.vram[addr];
    const high = vdpState.vram[addr + 1];
    const tileIndex = ((high & 0x03) << 8) | low;
    if (tileIndex !== 0) tileIndices.add(tileIndex);
  }
  
  console.log(`Unique non-zero tile indices: ${tileIndices.size}`);
  if (tileIndices.size > 0) {
    const indices = Array.from(tileIndices).sort((a,b) => a - b).slice(0, 10);
    console.log(`First few indices: ${indices.map(i => `0x${i.toString(16)}`).join(', ')}`);
    
    // Calculate where these tiles would be in memory
    const firstIndex = indices[0];
    console.log(`\nTile index 0x${firstIndex.toString(16)} would be at:`);
    console.log(`  - If pattern base = 0x0000: offset 0x${(firstIndex * 32).toString(16)}`);
    console.log(`  - If pattern base = 0x2000: offset 0x${(0x2000 + firstIndex * 32).toString(16)}`);
    console.log(`  - If pattern base = 0x3800: offset 0x${(0x3800 + firstIndex * 32).toString(16)}`);
  }
}
