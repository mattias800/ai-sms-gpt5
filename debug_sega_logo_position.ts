#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug SEGA logo position\n');

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

  // Check the SEGA logo area
  console.log('\n=== SEGA Logo Area Check ===');
  
  const nameTableBase = (((finalState.regs[2] ?? 0) >> 1) & 0x07) << 11;
  const hScrollGlobal = finalState.regs[8] ?? 0;
  const vScroll = finalState.regs[9] ?? 0;
  
  console.log(`Name table base: 0x${nameTableBase.toString(16)}`);
  console.log(`H scroll: 0x${hScrollGlobal.toString(16)}`);
  console.log(`V scroll: 0x${vScroll.toString(16)}`);

  // The SEGA logo tiles are at tile positions (11, 8) through (20, 11)
  // Let's check what screen positions these map to
  for (let ty = 8; ty <= 11; ty++) {
    for (let tx = 11; tx <= 20; tx++) {
      // Convert tile position to screen position
      const screenY = (ty * 8 - vScroll) & 0xff;
      const screenX = (tx * 8 + hScrollGlobal) & 0xff;
      
      console.log(`Tile (${tx}, ${ty}) -> Screen (${screenX}, ${screenY})`);
      
      // Check if this is in the visible area
      if (screenX >= 0 && screenX < 256 && screenY >= 0 && screenY < 192) {
        console.log(`  -> Visible at screen position (${screenX}, ${screenY})`);
        
        // Check the center of this tile
        const centerX = screenX + 4;
        const centerY = screenY + 4;
        console.log(`  -> Center of tile at screen (${centerX}, ${centerY})`);
      }
    }
  }

  // Now let's check what's actually at the center of the screen
  console.log('\n=== Center Screen Analysis ===');
  const centerX = 128, centerY = 96;
  
  // Calculate the actual position in the tilemap after scrolling
  const scrolledY = (centerY + vScroll) & 0xff;
  const scrolledX = (centerX - hScrollGlobal) & 0xff;
  
  const tileY = scrolledY >> 3;
  const tileX = scrolledX >> 3;
  
  console.log(`Screen center (${centerX}, ${centerY}) -> Tile (${tileX}, ${tileY})`);
  
  // Check what tile is at this position
  const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
  const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;
  const nameLow = vram[nameAddr] ?? 0;
  const nameHigh = vram[nameAddr + 1] ?? 0;
  const tileNum = nameLow | ((nameHigh & 0x01) << 8);
  
  console.log(`Tile at center: ${tileNum}`);

  // Let's check a few positions around the center to see if we can find the logo
  console.log('\n=== Searching for Logo Around Center ===');
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const testX = centerX + dx * 8;
      const testY = centerY + dy * 8;
      
      if (testX >= 0 && testX < 256 && testY >= 0 && testY < 192) {
        const scrolledY = (testY + vScroll) & 0xff;
        const scrolledX = (testX - hScrollGlobal) & 0xff;
        const tileY = scrolledY >> 3;
        const tileX = scrolledX >> 3;
        const nameIdx = ((tileY & 0x1f) * 32 + (tileX & 0x1f)) & 0x7ff;
        const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;
        const nameLow = vram[nameAddr] ?? 0;
        const nameHigh = vram[nameAddr + 1] ?? 0;
        const tileNum = nameLow | ((nameHigh & 0x01) << 8);
        
        if (tileNum !== 0) {
          console.log(`Screen (${testX}, ${testY}) -> Tile (${tileX}, ${tileY}) -> TileNum ${tileNum}`);
        }
      }
    }
  }

  return 0;
};

const code = main();
process.exit(code);
