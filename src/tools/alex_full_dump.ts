import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import type { Cartridge } from '../bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Alex Kidd Full VRAM Analysis ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

// Run until we get graphics
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 116; frame++) {
  m.runCycles(cyclesPerFrame);
}

const vdp = m.getVDP();
const vdpState = vdp.getState ? vdp.getState() : undefined;

if (!vdpState) {
  console.log('No VDP state!');
  process.exit(1);
}

// Check actual tile data for tiles referenced by name table
console.log('=== Checking tiles referenced by name table ===');
const nameTableBase = ((vdpState.regs[2] & 0x0E) << 10);

// In SMS mode, pattern base is calculated differently for BG tiles
// For Mode 4 (SMS), bit 2 of R4 selects between 0x0000 and 0x2000
const patternBaseBit = (vdpState.regs[4] & 0x04) ? 0x2000 : 0x0000;
console.log(`Pattern base (from R4 bit 2): 0x${patternBaseBit.toString(16)}`);

// Check tiles 205, 217, etc that are referenced
const tilesToCheck = [205, 217, 8, 218, 144, 1, 104, 129];
for (const tile of tilesToCheck) {
  // In SMS mode, tiles are at pattern_base + (tile_number * 32)
  const addr = (patternBaseBit + (tile * 32)) & 0x3fff;
  console.log(`\nTile ${tile} @ VRAM[0x${addr.toString(16).padStart(4, '0')}]:`);
  
  // Check if tile has data
  let hasData = false;
  for (let i = 0; i < 32; i++) {
    if (vdpState.vram[addr + i] !== 0) {
      hasData = true;
      break;
    }
  }
  
  if (!hasData) {
    console.log('  (empty)');
  } else {
    // Show first row as sample
    const b0 = vdpState.vram[addr] ?? 0;
    const b1 = vdpState.vram[addr + 1] ?? 0;
    const b2 = vdpState.vram[addr + 2] ?? 0;
    const b3 = vdpState.vram[addr + 3] ?? 0;
    let pixels = '';
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const color = ((b0 >> bit) & 1) | 
                   (((b1 >> bit) & 1) << 1) |
                   (((b2 >> bit) & 1) << 2) |
                   (((b3 >> bit) & 1) << 3);
      pixels += color.toString(16);
    }
    console.log(`  Row 0: ${pixels}`);
  }
}

// Scan entire VRAM to find where actual tile data is
console.log('\n=== Scanning for tile data in VRAM ===');
let tilesFound = 0;
for (let addr = 0; addr < 0x4000 && tilesFound < 10; addr += 32) {
  let hasData = false;
  let nonZeroCount = 0;
  for (let i = 0; i < 32; i++) {
    if (vdpState.vram[addr + i] !== 0) {
      nonZeroCount++;
      if (nonZeroCount > 4) { // At least 4 non-zero bytes
        hasData = true;
        break;
      }
    }
  }
  
  if (hasData) {
    console.log(`Tile at 0x${addr.toString(16).padStart(4, '0')} (tile ${Math.floor(addr/32)})`);
    tilesFound++;
  }
}

// Check first few bytes of name table
console.log('\n=== Name table dump (first 64 entries) ===');
for (let i = 0; i < 64; i++) {
  const addr = (nameTableBase + i * 2) & 0x3fff;
  const low = vdpState.vram[addr] ?? 0;
  const high = vdpState.vram[addr + 1] ?? 0;
  const entry = (high << 8) | low;
  if (i % 8 === 0) process.stdout.write(`\n${i.toString(16).padStart(3, '0')}: `);
  process.stdout.write(entry.toString(16).padStart(4, '0') + ' ');
}
console.log('\n');
