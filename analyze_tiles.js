import { readFileSync } from 'fs';
import { createMachine } from './build/machine/machine.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

// Run until display is on
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 120; frame++) {
  m.runCycles(cyclesPerFrame);
  const vdp = m.getVDP();
  const vdpState = vdp.getState ? vdp.getState() : undefined;
  if (vdpState && vdpState.displayEnabled && vdpState.nonZeroVramWrites > 3000) {
    break;
  }
}

const vdp = m.getVDP();
const vdpState = vdp.getState();

// Find all tiles with pattern data
const tilesWithData = new Set();
for (let tile = 0; tile < 512; tile++) { // Check up to 512 tiles
  const addr = tile << 5;
  if (addr >= 0x4000) break;
  
  let hasData = false;
  for (let i = 0; i < 32; i++) {
    if (vdpState.vram[addr + i] !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) {
    tilesWithData.add(tile);
  }
}

// Find all tiles referenced in name table
const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
const referencedTiles = new Map();

for (let i = 0; i < 32 * 28 * 2; i += 2) { // Check 28 rows
  const addr = (nameBase + i) & 0x3fff;
  const low = vdpState.vram[addr];
  const high = vdpState.vram[addr + 1];
  const tileIndex = ((high & 0x03) << 8) | low;
  
  if (tileIndex !== 0) {
    referencedTiles.set(tileIndex, (referencedTiles.get(tileIndex) || 0) + 1);
  }
}

console.log('Tiles with pattern data:', Array.from(tilesWithData).sort((a,b) => a-b));
console.log('Total tiles with data:', tilesWithData.size);

console.log('\nTiles referenced in name table:');
const sortedRefs = Array.from(referencedTiles.entries()).sort((a, b) => b[1] - a[1]);
for (const [tile, count] of sortedRefs.slice(0, 15)) {
  const hasData = tilesWithData.has(tile);
  console.log(`  Tile ${tile} (0x${tile.toString(16)}): ${count} refs, ${hasData ? 'HAS DATA' : 'NO DATA'}`);
}

console.log('\nMismatch analysis:');
const missingData = [];
const hasDataUsed = [];
for (const [tile] of referencedTiles) {
  if (tilesWithData.has(tile)) {
    hasDataUsed.push(tile);
  } else {
    missingData.push(tile);
  }
}

console.log('Referenced tiles WITH data:', hasDataUsed.sort((a,b) => a-b));
console.log('Referenced tiles WITHOUT data:', missingData.sort((a,b) => a-b).slice(0, 20), missingData.length > 20 ? '...' : '');

// Check if there's a pattern offset issue
console.log('\nPattern offset hypothesis:');
console.log('If tiles are offset by 200 (0xC8):');
let matchesWithOffset = 0;
for (const [tile] of referencedTiles) {
  const offsetTile = tile - 200;
  if (offsetTile > 0 && tilesWithData.has(offsetTile)) {
    matchesWithOffset++;
  }
}
console.log(`  ${matchesWithOffset} tiles would match with -200 offset`);

// Check sprite attribute table
const spriteBase = ((vdpState.regs[5] & 0x7e) << 7);
console.log(`\nSprite attribute table at 0x${spriteBase.toString(16)}:`);
