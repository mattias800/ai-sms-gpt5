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
    console.log(`Stopped at frame ${frame}`);
    break;
  }
}

const vdp = m.getVDP();
const vdpState = vdp.getState();

function rgbFromCram(val) {
  const r = ((val >>> 4) & 0x03) * 85;
  const g = ((val >>> 2) & 0x03) * 85;
  const b = (val & 0x03) * 85;
  return [r, g, b];
}

// Create simplified ASCII view
const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
const patternBase = 0x0000; // Where the data actually is

console.log('\nSimplified tile map (32x24):');
console.log('Legend: . = tile 0, # = tiles with data, ? = tiles without data');

for (let ty = 0; ty < 24; ty++) {
  let line = '';
  for (let tx = 0; tx < 32; tx++) {
    const entryAddr = (nameBase + ((ty * 32 + tx) << 1)) & 0x3fff;
    const low = vdpState.vram[entryAddr];
    const high = vdpState.vram[entryAddr + 1];
    const tileIndex = ((high & 0x03) << 8) | low;
    
    if (tileIndex === 0) {
      line += '.';
    } else {
      // Check if tile has data
      const pattAddr = (patternBase + (tileIndex << 5)) & 0x3fff;
      let hasData = false;
      for (let i = 0; i < 32; i++) {
        if (vdpState.vram[pattAddr + i] !== 0) {
          hasData = true;
          break;
        }
      }
      line += hasData ? '#' : '?';
    }
  }
  console.log(line);
}

// Show first few tiles with actual graphics
console.log('\nTiles with actual pattern data:');
const tilesWithData = [];
for (let tile = 0; tile < 256; tile++) {
  const addr = (tile << 5);
  let hasData = false;
  for (let i = 0; i < 32; i++) {
    if (vdpState.vram[addr + i] !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) {
    tilesWithData.push(tile);
  }
}
console.log('Tiles:', tilesWithData.slice(0, 20).join(', '), tilesWithData.length > 20 ? '...' : '');
console.log('Total tiles with data:', tilesWithData.length);

// Show a sample 8x8 tile
if (tilesWithData.length > 0) {
  const sampleTile = tilesWithData[0];
  const addr = sampleTile << 5;
  console.log(`\nSample tile ${sampleTile} pattern (8x8):`);
  
  for (let row = 0; row < 8; row++) {
    const b0 = vdpState.vram[addr + row * 4];
    const b1 = vdpState.vram[addr + row * 4 + 1];
    const b2 = vdpState.vram[addr + row * 4 + 2];
    const b3 = vdpState.vram[addr + row * 4 + 3];
    
    let line = '';
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const ci = ((b0 >>> bit) & 1) | (((b1 >>> bit) & 1) << 1) | 
                (((b2 >>> bit) & 1) << 2) | (((b3 >>> bit) & 1) << 3);
      line += ci === 0 ? '.' : ci.toString(16).toUpperCase();
    }
    console.log(line);
  }
}
