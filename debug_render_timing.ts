#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug render timing issue\n');

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

  console.log('\n=== Initial Render ===');
  if (vdp.renderFrame) {
    const frame1 = vdp.renderFrame();
    const testX = 128, testY = 80;
    const idx = (testY * 256 + testX) * 3;
    const pixelR = frame1[idx] ?? 0;
    const pixelG = frame1[idx + 1] ?? 0;
    const pixelB = frame1[idx + 2] ?? 0;
    console.log(`Pixel at (${testX}, ${testY}): RGB(${pixelR}, ${pixelG}, ${pixelB})`);
  }

  // Apply the fix: set background color to use CRAM[2] (light blue)
  console.log('\n=== Setting Background Color to CRAM[2] ===');
  vdp.writePort(0xBF, 0x02); // Value (CRAM index 2)
  vdp.writePort(0xBF, 0x87); // Register 7

  // Check state after register write
  const afterWriteState = vdp.getState?.();
  console.log(`Register 7 after write: 0x${afterWriteState?.regs[7]?.toString(16).padStart(2, '0')}`);

  // Render immediately after register write
  console.log('\n=== Render After Register Write ===');
  if (vdp.renderFrame) {
    const frame2 = vdp.renderFrame();
    const testX = 128, testY = 80;
    const idx = (testY * 256 + testX) * 3;
    const pixelR = frame2[idx] ?? 0;
    const pixelG = frame2[idx + 1] ?? 0;
    const pixelB = frame2[idx + 2] ?? 0;
    console.log(`Pixel at (${testX}, ${testY}): RGB(${pixelR}, ${pixelG}, ${pixelB})`);
  }

  // Run a few more cycles and render again
  console.log('\n=== Running More Cycles ===');
  machine.runCycles(cyclesPerFrame * 2);

  console.log('\n=== Render After More Cycles ===');
  if (vdp.renderFrame) {
    const frame3 = vdp.renderFrame();
    const testX = 128, testY = 80;
    const idx = (testY * 256 + testX) * 3;
    const pixelR = frame3[idx] ?? 0;
    const pixelG = frame3[idx + 1] ?? 0;
    const pixelB = frame3[idx + 2] ?? 0;
    console.log(`Pixel at (${testX}, ${testY}): RGB(${pixelR}, ${pixelG}, ${pixelB})`);
  }

  // Check the final state
  const finalState = vdp.getState?.();
  console.log(`\nFinal Register 7: 0x${finalState?.regs[7]?.toString(16).padStart(2, '0')}`);

  return 0;
};

const code = main();
process.exit(code);
