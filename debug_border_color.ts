#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug border color calculation\n');

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

  // Check initial state
  const initialState = vdp.getState?.();
  if (!initialState) {
    console.error('Could not get VDP state');
    return 1;
  }

  const cram = vdp.getCRAM();
  
  console.log('\n=== Initial State ===');
  console.log(`Register 7: 0x${initialState.regs[7]?.toString(16).padStart(2, '0')}`);
  const bgColor = (initialState.regs[7] ?? 0) & 0x0f;
  console.log(`Background color index: ${bgColor}`);
  
  const entry = (cram[bgColor] ?? 0) & 0x3f;
  const r = ((entry & 0x03) * 85) & 0xff;
  const g = (((entry >> 2) & 0x03) * 85) & 0xff;
  const b = (((entry >> 4) & 0x03) * 85) & 0xff;
  console.log(`CRAM entry: 0x${entry.toString(16)}`);
  console.log(`Border RGB: (${r}, ${g}, ${b})`);

  // Apply the fix: set background color to use CRAM[2] (light blue)
  console.log('\n=== Setting Background Color to CRAM[2] ===');
  vdp.writePort(0xBF, 0x02); // Value (CRAM index 2)
  vdp.writePort(0xBF, 0x87); // Register 7

  // Check new state
  const newState = vdp.getState?.();
  if (!newState) {
    console.error('Could not get VDP state after fix');
    return 1;
  }

  console.log(`\n=== After Fix ===`);
  console.log(`Register 7: 0x${newState.regs[7]?.toString(16).padStart(2, '0')}`);
  const newBgColor = (newState.regs[7] ?? 0) & 0x0f;
  console.log(`Background color index: ${newBgColor}`);
  
  const newEntry = (cram[newBgColor] ?? 0) & 0x3f;
  const newR = ((newEntry & 0x03) * 85) & 0xff;
  const newG = (((newEntry >> 2) & 0x03) * 85) & 0xff;
  const newB = (((newEntry >> 4) & 0x03) * 85) & 0xff;
  console.log(`CRAM entry: 0x${newEntry.toString(16)}`);
  console.log(`Border RGB: (${newR}, ${newG}, ${newB})`);

  // Check CRAM[2] directly
  const cram2Entry = (cram[2] ?? 0) & 0x3f;
  const cram2R = ((cram2Entry & 0x03) * 85) & 0xff;
  const cram2G = (((cram2Entry >> 2) & 0x03) * 85) & 0xff;
  const cram2B = (((cram2Entry >> 4) & 0x03) * 85) & 0xff;
  console.log(`\nCRAM[2] directly: 0x${cram2Entry.toString(16)} -> RGB(${cram2R}, ${cram2G}, ${cram2B})`);

  // Try to render a frame and check a specific pixel
  if (vdp.renderFrame) {
    const frame = vdp.renderFrame();
    
    // Check a pixel that should be color index 0
    const testX = 128, testY = 80; // This should be in the logo area
    const idx = (testY * 256 + testX) * 3;
    const pixelR = frame[idx] ?? 0;
    const pixelG = frame[idx + 1] ?? 0;
    const pixelB = frame[idx + 2] ?? 0;
    
    console.log(`\n=== Pixel Check ===`);
    console.log(`Pixel at (${testX}, ${testY}): RGB(${pixelR}, ${pixelG}, ${pixelB})`);
    
    if (pixelR === newR && pixelG === newG && pixelB === newB) {
      console.log('✅ Pixel color matches border color - color index 0 is working correctly');
    } else {
      console.log('❌ Pixel color does not match border color - color index 0 is not working');
    }
  }

  return 0;
};

const code = main();
process.exit(code);
