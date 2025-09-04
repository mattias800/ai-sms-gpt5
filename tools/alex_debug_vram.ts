import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Alex Kidd VRAM/CRAM Debug ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

// Run until we get graphics
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 116; frame++) {
  m.runCycles(cyclesPerFrame);
}

const vdp = m.getVDP();
const vdpState = vdp.getState ? vdp.getState?.() : undefined;

if (!vdpState) {
  console.log('No VDP state!');
  process.exit(1);
}

console.log('VDP State:');
console.log(`Display: ${vdpState.displayEnabled}`);
console.log(`VRAM writes: ${vdpState.vramWrites}, non-zero: ${vdpState.nonZeroVramWrites}`);
console.log(`CRAM writes: ${vdpState.cramWrites}`);

// Check CRAM
console.log('\n=== CRAM (Color RAM) ===');
let hasColor = false;
for (let i = 0; i < 32; i++) {
  const val = vdpState.cram[i] ?? 0 ?? 0;
  if (val !== 0) {
    hasColor = true;
    const r = (val >> 4) & 3;
    const g = (val >> 2) & 3;
    const b = val & 3;
    console.log(
      `CRAM[${i.toString(16).padStart(2, '0')}] = 0x${val.toString(16).padStart(2, '0')} (R=${r} G=${g} B=${b})`
    );
  }
}
if (!hasColor) {
  console.log('All CRAM is zero (black palette)!');
}

// Check name table
const nameTableBase = ((vdpState.regs?.[2] ?? 0) & 0x0e) << 10;
console.log(`\n=== Name Table (base=0x${nameTableBase.toString(16)}) ===`);
console.log('First 10 non-zero entries:');
let nameCount = 0;
for (let i = 0; i < 32 * 24 * 2 && nameCount < 10; i += 2) {
  const addr = (nameTableBase + i) & 0x3fff;
  const low = vdpState.vram[addr] ?? 0 ?? 0;
  const high = vdpState.vram[addr + 1] ?? 0 ?? 0;
  const entry = (high << 8) | low;
  if (entry !== 0) {
    const tileIndex = entry & 0x3ff;
    console.log(
      `  Name[${(i / 2).toString(16)}] @ VRAM[0x${addr.toString(16)}] = 0x${entry.toString(16).padStart(4, '0')} (tile ${tileIndex})`
    );
    nameCount++;
  }
}

// Check pattern data
const patternBase = ((vdpState.regs?.[4] ?? 0) & 0x07) << 11;
console.log(`\n=== Pattern Data (base=0x${patternBase.toString(16)}) ===`);
console.log('First 5 non-zero tiles:');
let tileCount = 0;
for (let tile = 0; tile < 512 && tileCount < 5; tile++) {
  const addr = (patternBase + tile * 32) & 0x3fff;
  let hasData = false;
  for (let i = 0; i < 32; i++) {
    if ((vdpState.vram[addr + i] ?? 0) !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) {
    console.log(`  Tile ${tile} @ VRAM[0x${addr.toString(16)}]:`);
    for (let row = 0; row < 8; row++) {
      const b0 = vdpState.vram[addr + row * 4] ?? 0 ?? 0;
      const b1 = vdpState.vram[addr + row * 4 + 1] ?? 0 ?? 0;
      const b2 = vdpState.vram[addr + row * 4 + 2] ?? 0 ?? 0;
      const b3 = vdpState.vram[addr + row * 4 + 3] ?? 0 ?? 0;
      let pixels = '';
      for (let col = 0; col < 8; col++) {
        const bit = 7 - col;
        const color =
          ((b0 >> bit) & 1) | (((b1 >> bit) & 1) << 1) | (((b2 >> bit) & 1) << 2) | (((b3 >> bit) & 1) << 3);
        pixels += color.toString(16);
      }
      console.log(`    Row ${row}: ${pixels}`);
    }
    tileCount++;
  }
}

// Check scrolling registers
console.log('\n=== Scrolling ===');
console.log(
  `Horizontal scroll (R8): ${vdpState.regs?.[8] ?? 0} (shifts screen ${256 - (vdpState.regs?.[8] ?? 0)} pixels left)`
);
console.log(
  `Vertical scroll (R9): ${vdpState.regs?.[9] ?? 0} (shifts screen ${vdpState.regs?.[9] ?? 0} pixels up)`
);

// Check sprite attribute table
const spriteTableBase = ((vdpState.regs?.[5] ?? 0) & 0x7e) << 7;
console.log(`\n=== Sprite Attribute Table (base=0x${spriteTableBase.toString(16)}) ===`);
let spriteCount = 0;
for (let i = 0; i < 64; i++) {
  const addr = (spriteTableBase + i) & 0x3fff;
  const y = vdpState.vram[addr] ?? 0 ?? 0;
  if (y === 0xd0) break; // End marker
  if (y > 0 && y < 0xe0) {
    const x = vdpState.vram[(spriteTableBase + 128 + i * 2) & 0x3fff] ?? 0 ?? 0;
    const pattern = vdpState.vram[(spriteTableBase + 128 + i * 2 + 1) & 0x3fff] ?? 0 ?? 0;
    console.log(`  Sprite ${i}: Y=${y - 1} X=${x} Pattern=${pattern}`);
    spriteCount++;
    if (spriteCount >= 5) break;
  }
}
if (spriteCount === 0) {
  console.log('  No active sprites');
}

// Save raw VRAM/CRAM for inspection
writeFileSync('alex_vram.bin', Buffer.from(vdpState.vram));
writeFileSync('alex_cram.bin', new Uint8Array(vdpState.cram));
console.log('\nSaved alex_vram.bin and alex_cram.bin for inspection');
