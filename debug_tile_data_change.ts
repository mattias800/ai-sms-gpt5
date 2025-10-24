#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug tile data changes\n');

  // Load ROM and BIOS
  const romData = readFileSync('wonderboy5.sms');
  let biosData: Uint8Array;
  try {
    biosData = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
    console.log('Using BIOS: ./third_party/mame/roms/sms1/mpr-10052.rom');
  } catch {
    biosData = new Uint8Array(readFileSync('./mpr-10052.rom'));
    console.log('Using BIOS: ./mpr-10052.rom');
  }

  const cart = { rom: new Uint8Array(romData) };
  const machine = createMachine({ cart, useManualInit: false, bus: { bios: biosData } });
  const vdp = machine.getVDP();

  const st = vdp.getState?.();
  const cyclesPerLine = st?.cyclesPerLine ?? 228;
  const linesPerFrame = st?.linesPerFrame ?? 262;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;

  // Run exactly 120 frames
  for (let f = 1; f <= 120; f++) {
    machine.runCycles(cyclesPerFrame);
  }

  // Check initial tile data
  const initialState = vdp.getState?.();
  if (!initialState) {
    console.error('Could not get VDP state');
    return 1;
  }

  const vram = vdp.getVRAM();
  const cram = vdp.getCRAM();

  // Check tile at position (128, 80)
  const testX = 128, testY = 80;
  const nameTableBase = (((initialState.regs[2] ?? 0) >> 1) & 0x07) << 11;
  const hScrollGlobal = initialState.regs[8] ?? 0;
  const vScroll = initialState.regs[9] ?? 0;
  
  const scrolledY = (testY + vScroll) & 0xff;
  const scrolledX = (testX - hScrollGlobal) & 0xff;
  const tileY = scrolledY >> 3;
  const tileX = scrolledX >> 3;
  const pixelY = scrolledY & 7;
  const pixelX = scrolledX & 7;
  
  const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
  const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;
  const nameLow = vram[nameAddr] ?? 0;
  const nameHigh = vram[nameAddr + 1] ?? 0;
  const tileNum = nameLow | ((nameHigh & 0x01) << 8);
  
  console.log('\n=== Initial Tile Data ===');
  console.log(`Screen position (${testX}, ${testY}) -> Tile (${tileX}, ${tileY})`);
  console.log(`Tile number: ${tileNum}`);
  
  if (tileNum !== 0) {
    const tileAddr = (tileNum * 32) & 0x3fff;
    const rowAddr = (tileAddr + pixelY * 4) & 0x3fff;
    const bit = 7 - pixelX;
    
    const plane0 = ((vram[rowAddr] ?? 0) >> bit) & 1;
    const plane1 = ((vram[rowAddr + 1] ?? 0) >> bit) & 1;
    const plane2 = ((vram[rowAddr + 2] ?? 0) >> bit) & 1;
    const plane3 = ((vram[rowAddr + 3] ?? 0) >> bit) & 1;
    
    const colorIdx = plane0 | (plane1 << 1) | (plane2 << 2) | (plane3 << 3);
    console.log(`Color index: ${colorIdx}`);
    
    const entry = (cram[colorIdx] ?? 0) & 0x3f;
    const r = ((entry & 0x03) * 85) & 0xff;
    const g = (((entry >> 2) & 0x03) * 85) & 0xff;
    const b = (((entry >> 4) & 0x03) * 85) & 0xff;
    console.log(`CRAM entry: 0x${entry.toString(16)}`);
    console.log(`Expected RGB: (${r}, ${g}, ${b})`);
  }

  // Apply the fix: set background color to use CRAM[2] (light blue)
  console.log('\n=== Setting Background Color to CRAM[2] ===');
  vdp.writePort(0xBF, 0x02); // Value (CRAM index 2)
  vdp.writePort(0xBF, 0x87); // Register 7

  // Run a few more cycles
  console.log('\n=== Running More Cycles ===');
  machine.runCycles(cyclesPerFrame * 2);

  // Check tile data after cycles
  const afterState = vdp.getState?.();
  const afterVram = vdp.getVRAM();
  
  const afterScrolledY = (testY + (afterState?.regs[9] ?? 0)) & 0xff;
  const afterScrolledX = (testX - (afterState?.regs[8] ?? 0)) & 0xff;
  const afterTileY = afterScrolledY >> 3;
  const afterTileX = afterScrolledX >> 3;
  const afterPixelY = afterScrolledY & 7;
  const afterPixelX = afterScrolledX & 7;
  
  const afterNameIdx = ((afterTileY & 0x1f) * 32 + (afterTileX & 0x1f)) & 0x7ff;
  const afterNameAddr = (nameTableBase + afterNameIdx * 2) & 0x3fff;
  const afterNameLow = afterVram[afterNameAddr] ?? 0;
  const afterNameHigh = afterVram[afterNameAddr + 1] ?? 0;
  const afterTileNum = afterNameLow | ((afterNameHigh & 0x01) << 8);
  
  console.log('\n=== After Cycles Tile Data ===');
  console.log(`Screen position (${testX}, ${testY}) -> Tile (${afterTileX}, ${afterTileY})`);
  console.log(`Tile number: ${afterTileNum}`);
  
  if (afterTileNum !== 0) {
    const afterTileAddr = (afterTileNum * 32) & 0x3fff;
    const afterRowAddr = (afterTileAddr + afterPixelY * 4) & 0x3fff;
    const afterBit = 7 - afterPixelX;
    
    const afterPlane0 = ((afterVram[afterRowAddr] ?? 0) >> afterBit) & 1;
    const afterPlane1 = ((afterVram[afterRowAddr + 1] ?? 0) >> afterBit) & 1;
    const afterPlane2 = ((afterVram[afterRowAddr + 2] ?? 0) >> afterBit) & 1;
    const afterPlane3 = ((afterVram[afterRowAddr + 3] ?? 0) >> afterBit) & 1;
    
    const afterColorIdx = afterPlane0 | (afterPlane1 << 1) | (afterPlane2 << 2) | (afterPlane3 << 3);
    console.log(`Color index: ${afterColorIdx}`);
    
    const afterEntry = (cram[afterColorIdx] ?? 0) & 0x3f;
    const afterR = ((afterEntry & 0x03) * 85) & 0xff;
    const afterG = (((afterEntry >> 2) & 0x03) * 85) & 0xff;
    const afterB = (((afterEntry >> 4) & 0x03) * 85) & 0xff;
    console.log(`CRAM entry: 0x${afterEntry.toString(16)}`);
    console.log(`Expected RGB: (${afterR}, ${afterG}, ${afterB})`);
  }

  // Check if the tile number changed
  if (tileNum !== afterTileNum) {
    console.log(`\n⚠️ Tile number changed from ${tileNum} to ${afterTileNum}`);
  } else {
    console.log(`\n✅ Tile number unchanged: ${tileNum}`);
  }

  return 0;
};

const code = main();
process.exit(code);
