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

// Find all non-zero regions in VRAM
console.log('\nNon-zero VRAM regions:');
let inRegion = false;
let regionStart = 0;
for (let i = 0; i < 0x4000; i++) {
  if (vdpState.vram[i] !== 0) {
    if (!inRegion) {
      inRegion = true;
      regionStart = i;
    }
  } else {
    if (inRegion) {
      console.log(`  0x${regionStart.toString(16).padStart(4, '0')} - 0x${(i-1).toString(16).padStart(4, '0')}`);
      inRegion = false;
    }
  }
}
if (inRegion) {
  console.log(`  0x${regionStart.toString(16).padStart(4, '0')} - 0x3fff`);
}

// Check what tile indices point to
const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
console.log('\nName table tile analysis:');
const tileCounts = new Map();
for (let i = 0; i < 32 * 24 * 2; i += 2) {
  const addr = (nameBase + i) & 0x3fff;
  const low = vdpState.vram[addr];
  const high = vdpState.vram[addr + 1];
  const tileIndex = ((high & 0x03) << 8) | low;
  if (tileIndex !== 0) {
    tileCounts.set(tileIndex, (tileCounts.get(tileIndex) || 0) + 1);
  }
}

// Show most common tiles
const sorted = Array.from(tileCounts.entries()).sort((a, b) => b[1] - a[1]);
console.log('Most common tiles:');
for (let i = 0; i < Math.min(5, sorted.length); i++) {
  const [tileIndex, count] = sorted[i];
  const addr0 = (tileIndex << 5) & 0x3fff;
  const addr2000 = ((0x2000 + (tileIndex << 5)) & 0x3fff);
  const has0 = vdpState.vram[addr0] !== 0 || vdpState.vram[addr0 + 1] !== 0;
  const has2000 = vdpState.vram[addr2000] !== 0 || vdpState.vram[addr2000 + 1] !== 0;
  console.log(`  Tile ${tileIndex} (0x${tileIndex.toString(16)}): ${count} uses`);
  console.log(`    Base 0x0000 -> 0x${addr0.toString(16).padStart(4, '0')}: ${has0 ? 'HAS DATA' : 'empty'}`);
  console.log(`    Base 0x2000 -> 0x${addr2000.toString(16).padStart(4, '0')}: ${has2000 ? 'HAS DATA' : 'empty'}`);
}

// Look at actual tile locations for low tiles (0-10)
console.log('\nLow tile indices (0-10):');
for (let tile = 0; tile <= 10; tile++) {
  const addr = (tile << 5) & 0x3fff;
  let hasData = false;
  for (let j = 0; j < 32; j++) {
    if (vdpState.vram[addr + j] !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) {
    console.log(`  Tile ${tile} at 0x${addr.toString(16).padStart(4, '0')}: Has data`);
  }
}
