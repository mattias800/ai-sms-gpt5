#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug tile rendering step by step\n');

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

  // Apply the background color fix
  vdp.writePort(0xBF, 0x02); // Value (CRAM index 2)
  vdp.writePort(0xBF, 0x87); // Register 7

  const finalState = vdp.getState?.();
  if (!finalState) {
    console.error('Could not get VDP state');
    return 1;
  }

  const vram = vdp.getVRAM();
  const cram = vdp.getCRAM();

  // Manually trace the tile rendering for the center area
  console.log('\n=== Manual Tile Rendering Trace ===');
  
  const nameTableBase = (((finalState.regs[2] ?? 0) >> 1) & 0x07) << 11;
  const hScrollGlobal = finalState.regs[8] ?? 0;
  const vScroll = finalState.regs[9] ?? 0;
  
  console.log(`Name table base: 0x${nameTableBase.toString(16)}`);
  console.log(`H scroll: 0x${hScrollGlobal.toString(16)}`);
  console.log(`V scroll: 0x${vScroll.toString(16)}`);

  // Check the center area (around screen position 128,96)
  const centerX = 128, centerY = 96;
  console.log(`\nChecking screen position (${centerX}, ${centerY}):`);
  
  // Calculate the actual position in the tilemap after scrolling
  const scrolledY = (centerY + vScroll) & 0xff;
  const scrolledX = (centerX - hScrollGlobal) & 0xff;
  
  console.log(`Scrolled position: (${scrolledX}, ${scrolledY})`);
  
  const tileY = scrolledY >> 3; // Divide by 8 to get tile row
  const tileX = scrolledX >> 3; // Divide by 8 to get tile column
  const pixelY = scrolledY & 7; // Y position within the tile
  const pixelX = scrolledX & 7; // X position within the tile
  
  console.log(`Tile position: (${tileX}, ${tileY})`);
  console.log(`Pixel within tile: (${pixelX}, ${pixelY})`);

  // Calculate name table index
  const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
  const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;
  
  console.log(`Name table index: ${nameIdx}`);
  console.log(`Name table address: 0x${nameAddr.toString(16)}`);

  // Read name table entry
  const nameLow = vram[nameAddr] ?? 0;
  const nameHigh = vram[nameAddr + 1] ?? 0;
  const tileNum = nameLow | ((nameHigh & 0x01) << 8);
  
  console.log(`Name table entry: low=0x${nameLow.toString(16)}, high=0x${nameHigh.toString(16)}`);
  console.log(`Tile number: ${tileNum}`);

  if (tileNum !== 0) {
    // Calculate tile address
    const tileAddr = (tileNum * 32) & 0x3fff;
    console.log(`Tile address: 0x${tileAddr.toString(16)}`);
    
    // Get the specific pixel from the tile
    const rowAddr = (tileAddr + pixelY * 4) & 0x3fff;
    const bit = 7 - pixelX;
    
    console.log(`Row address: 0x${rowAddr.toString(16)}`);
    console.log(`Bit position: ${bit}`);
    
    // Read 4 bitplanes for this pixel
    const plane0 = ((vram[rowAddr] ?? 0) >> bit) & 1;
    const plane1 = ((vram[rowAddr + 1] ?? 0) >> bit) & 1;
    const plane2 = ((vram[rowAddr + 2] ?? 0) >> bit) & 1;
    const plane3 = ((vram[rowAddr + 3] ?? 0) >> bit) & 1;
    
    console.log(`Planes: ${plane0} ${plane1} ${plane2} ${plane3}`);
    
    // Combine planes to get color index
    const colorIdx = plane0 | (plane1 << 1) | (plane2 << 2) | (plane3 << 3);
    console.log(`Color index: ${colorIdx}`);
    
    // Convert to RGB
    const entry = (cram[colorIdx & 0x1f] ?? 0) & 0x3f;
    const r = ((entry & 0x03) * 85) & 0xff;
    const g = (((entry >> 2) & 0x03) * 85) & 0xff;
    const b = (((entry >> 4) & 0x03) * 85) & 0xff;
    
    console.log(`CRAM entry: 0x${entry.toString(16)}`);
    console.log(`RGB: (${r}, ${g}, ${b})`);
  } else {
    console.log('Tile number is 0 - using background color');
    const bgColor = (finalState.regs[7] ?? 0) & 0x0f;
    const entry = (cram[bgColor] ?? 0) & 0x3f;
    const r = ((entry & 0x03) * 85) & 0xff;
    const g = (((entry >> 2) & 0x03) * 85) & 0xff;
    const b = (((entry >> 4) & 0x03) * 85) & 0xff;
    console.log(`Background color index: ${bgColor}`);
    console.log(`RGB: (${r}, ${g}, ${b})`);
  }

  return 0;
};

const code = main();
process.exit(code);
