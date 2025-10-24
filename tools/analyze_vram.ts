#!/usr/bin/env npx tsx
import { createMachine } from '../src/machine/machine.js';
import * as fs from 'fs';

const romPath = process.argv[2] || 'alexkidd.sms';
const frames = parseInt(process.argv[3] || '300');

if (!fs.existsSync(romPath)) {
  console.error(`ROM not found: ${romPath}`);
  process.exit(1);
}

const romData = new Uint8Array(fs.readFileSync(romPath));
console.log(`Loading: ${romPath}`);

const machine = createMachine({
  cart: { rom: romData },
  wait: { smsModel: false },
});

// Run frames
for (let i = 0; i < frames; i++) {
  machine.runCycles(59736);
}

const vdp = machine.getVDP();
if (!vdp.getState) {
  console.error('VDP has no getState');
  process.exit(1);
}

const state = vdp?.getState?.() ?? {};

console.log('\n=== VDP Analysis ===');
console.log(`Display: ${state.displayEnabled ? 'ON' : 'OFF'}`);

// Check register 4 more carefully
const r4 = state.regs[4];
console.log(`\nRegister 4: 0x${r4.toString(16).padStart(2, '0')} (${r4.toString(2).padStart(8, '0')}b)`);
console.log(
  `  Bit 2 (pattern select): ${r4 & 0x04 ? '1' : '0'} -> Pattern base: 0x${state.bgPatternBase.toString(16)}`
);

// Sample some name table entries
console.log('\nSample name table entries:');
const nameBase = state.nameTableBase;
for (let i = 0; i < 10; i++) {
  const addr = nameBase + i * 2;
  const low = state.vram[addr] ?? 0;
  const high = state.vram[addr + 1] ?? 0;
  const tileNum = low | ((high & 0x01) << 8);
  console.log(`  Entry ${i}: tile ${tileNum} (0x${tileNum.toString(16)}) attrs=0x${high.toString(16)}`);
}

// Check where actual pattern data is
console.log('\nPattern data analysis:');
for (let base = 0; base < 0x4000; base += 0x2000) {
  let nonZero = 0;
  for (let i = 0; i < 0x2000; i++) {
    if (state.vram[base + i] !== 0) nonZero++;
  }
  console.log(`  0x${base.toString(16).padStart(4, '0')}-0x${(base + 0x1fff).toString(16)}: ${nonZero} non-zero bytes`);
}

// Check specific tiles
console.log('\nChecking tile patterns:');
const patternBase = state.bgPatternBase;
for (let tile = 0; tile < 5; tile++) {
  const tileAddr = patternBase + tile * 32;
  console.log(`  Tile ${tile} at 0x${tileAddr.toString(16)}:`);
  let hasData = false;
  for (let row = 0; row < 8; row++) {
    const rowAddr = tileAddr + row * 4;
    const plane0 = state.vram[rowAddr];
    const plane1 = state.vram[rowAddr + 1];
    const plane2 = state.vram[rowAddr + 2];
    const plane3 = state.vram[rowAddr + 3];
    if (plane0 || plane1 || plane2 || plane3) {
      hasData = true;
      break;
    }
  }
  console.log(`    ${hasData ? 'Has data' : 'Empty'}`);
}

// Try to find where tile 1 actually is
console.log('\nSearching for tile patterns:');
const searchTile = 1;
for (let base = 0; base < 0x4000; base += 0x2000) {
  const addr = base + searchTile * 32;
  let hasData = false;
  for (let i = 0; i < 32; i++) {
    if (state.vram[addr + i] !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) {
    console.log(`  Tile ${searchTile} has data at base 0x${base.toString(16)}`);
    // Show first row
    const plane0 = state.vram[addr];
    const plane1 = state.vram[addr + 1];
    const plane2 = state.vram[addr + 2];
    const plane3 = state.vram[addr + 3];
    console.log(
      `    First row planes: ${plane0.toString(16)} ${plane1.toString(16)} ${plane2.toString(16)} ${plane3.toString(16)}`
    );
  }
}
