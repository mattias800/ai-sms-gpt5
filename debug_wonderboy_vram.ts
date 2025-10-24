#!/usr/bin/env tsx

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug Wonder Boy VRAM/CRAM state after 120 frames\n');

  // Load ROM and BIOS
  const romData = readFileSync('wonderboy5.sms');
  let biosData: Uint8Array;
  try {
    biosData = new Uint8Array(readFileSync('./mpr-10052.rom'));
    console.log('Using BIOS: ./mpr-10052.rom');
  } catch {
    try {
      biosData = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
      console.log('Using BIOS: third_party/mame/roms/sms1/mpr-10052.rom');
    } catch {
      biosData = new Uint8Array(readFileSync('bios13fx.sms'));
      console.log('Using BIOS: bios13fx.sms');
    }
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
    if (f % 30 === 0) {
      const s = vdp.getState?.();
      const pc = machine.getCPU().getState().pc;
      console.log(`Ran ${f} frames: PC=0x${pc.toString(16).padStart(4,'0')} Display=${s?.displayEnabled ? 'ON' : 'OFF'}`);
    }
  }

  // Get final state
  const finalState = vdp.getState?.();
  if (!finalState) {
    console.error('Could not get VDP state');
    return 1;
  }

  console.log('\n=== VDP State ===');
  console.log(`Display enabled: ${finalState.displayEnabled}`);
  console.log(`Register 1: 0x${finalState.regs[1]?.toString(16).padStart(2, '0')}`);
  console.log(`Register 2: 0x${finalState.regs[2]?.toString(16).padStart(2, '0')}`);
  console.log(`Register 7: 0x${finalState.regs[7]?.toString(16).padStart(2, '0')}`);
  console.log(`VRAM writes: ${finalState.vramWrites}`);
  console.log(`CRAM writes: ${finalState.cramWrites}`);
  console.log(`Non-zero VRAM writes: ${finalState.nonZeroVramWrites}`);
  console.log(`Last non-zero VRAM addr: 0x${finalState.lastNonZeroVramAddr.toString(16)}`);

  // Examine VRAM
  const vram = vdp.getVRAM();
  console.log('\n=== VRAM Analysis ===');
  
  // Count non-zero bytes in different regions
  const nameTableBase = (((finalState.regs[2] ?? 0) >> 1) & 0x07) << 11;
  console.log(`Name table base: 0x${nameTableBase.toString(16)}`);
  
  let nonZeroTotal = 0;
  let nonZeroPattern = 0;
  let nonZeroName = 0;
  
  for (let i = 0; i < vram.length; i++) {
    if (vram[i] !== 0) {
      nonZeroTotal++;
      if (i < 0x2000) nonZeroPattern++; // Pattern table region
      if (i >= nameTableBase && i < nameTableBase + 0x800) nonZeroName++; // Name table
    }
  }
  
  console.log(`Total non-zero VRAM bytes: ${nonZeroTotal}`);
  console.log(`Non-zero pattern bytes (0x0000-0x1FFF): ${nonZeroPattern}`);
  console.log(`Non-zero name table bytes: ${nonZeroName}`);

  // Examine CRAM
  const cram = vdp.getCRAM();
  console.log('\n=== CRAM Analysis ===');
  console.log('CRAM entries:');
  for (let i = 0; i < 32; i++) {
    const entry = cram[i] ?? 0;
    const r = ((entry & 0x03) * 85) & 0xff;
    const g = (((entry >> 2) & 0x03) * 85) & 0xff;
    const b = (((entry >> 4) & 0x03) * 85) & 0xff;
    console.log(`  [${i.toString().padStart(2)}]: 0x${entry.toString(16).padStart(2, '0')} -> RGB(${r},${g},${b})`);
  }

  // Try to render a frame and analyze it
  if (vdp.renderFrame) {
    const frame = vdp.renderFrame();
    console.log('\n=== Frame Analysis ===');
    
    // Count colors
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < frame.length; i += 3) {
      const r = frame[i] ?? 0;
      const g = frame[i + 1] ?? 0;
      const b = frame[i + 2] ?? 0;
      const key = `${r},${g},${b}`;
      colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
    }
    
    console.log('Top 10 colors in frame:');
    const sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < Math.min(10, sortedColors.length); i++) {
      const [color, count] = sortedColors[i]!;
      const percentage = (count / (256 * 192) * 100).toFixed(2);
      console.log(`  RGB(${color}): ${count} pixels (${percentage}%)`);
    }
  }

  return 0;
};

const code = main();
process.exit(code);
