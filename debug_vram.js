#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createMachine } from './dist/src/machine/machine.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

console.log('=== Running Alex Kidd to debug VRAM/CRAM ===\n');

// Run until display is enabled
const cyclesPerFrame = 59736;
let displayOn = false;

for (let frame = 0; frame < 200; frame++) {
  m.runCycles(cyclesPerFrame);
  
  const vdp = m.getVDP();
  const vdpState = vdp.getState ? vdp.getState() : undefined;
  
  if (vdpState && vdpState.displayEnabled && !displayOn) {
    displayOn = true;
    console.log(`Display enabled at frame ${frame}\n`);
    
    // Dump CRAM values
    console.log('=== CRAM Contents (first 32 bytes) ===');
    for (let i = 0; i < 32; i++) {
      const val = vdpState.cram[i];
      const r = (val & 0x03);
      const g = ((val >> 2) & 0x03);
      const b = ((val >> 4) & 0x03);
      console.log(`CRAM[${i.toString().padStart(2)}] = 0x${val.toString(16).padStart(2, '0')} (R:${r} G:${g} B:${b})`);
    }
    
    // Check VRAM patterns
    console.log('\n=== VRAM Pattern Data (first 128 bytes at 0x0000) ===');
    let hasNonZero = false;
    for (let i = 0; i < 128; i++) {
      if (vdpState.vram[i] !== 0) {
        hasNonZero = true;
        break;
      }
    }
    console.log(`Has non-zero pattern data at 0x0000: ${hasNonZero}`);
    
    // Check name table
    const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
    console.log(`\n=== Name Table at 0x${nameBase.toString(16)} ===`);
    let nonZeroTiles = 0;
    for (let i = 0; i < 768 * 2; i += 2) {
      const addr = nameBase + i;
      const low = vdpState.vram[addr];
      const high = vdpState.vram[addr + 1];
      const tileIndex = ((high & 0x03) << 8) | low;
      if (tileIndex !== 0) nonZeroTiles++;
    }
    console.log(`Non-zero tile indices: ${nonZeroTiles}/768`);
    
    // Sample first few tiles
    console.log('\nFirst 10 tiles in name table:');
    for (let i = 0; i < 10; i++) {
      const addr = nameBase + i * 2;
      const low = vdpState.vram[addr];
      const high = vdpState.vram[addr + 1];
      const tileIndex = ((high & 0x03) << 8) | low;
      console.log(`Tile ${i}: index=${tileIndex} (0x${tileIndex.toString(16)})`);
    }
    
    // Check VDP registers
    console.log('\n=== VDP Registers ===');
    console.log(`R2 (Name table): 0x${vdpState.regs[2].toString(16)} -> base = 0x${nameBase.toString(16)}`);
    console.log(`R4 (Pattern base): 0x${vdpState.regs[4].toString(16)} -> base = 0x${((vdpState.regs[4] & 0x07) << 11).toString(16)}`);
    
    break;
  }
}

if (!displayOn) {
  console.log('Display never turned on!');
}
