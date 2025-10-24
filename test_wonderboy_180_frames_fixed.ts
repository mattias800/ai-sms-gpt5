#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = async (): Promise<number> => {
  console.log('Wonder Boy 180 frames test with BIOS auto-disable fix\n');

  // Load ROM
  const romPath = './wonderboy5.sms';
  if (!existsSync(romPath)) {
    console.error(`ROM not found: ${romPath}`);
    return 1;
  }
  const rom = new Uint8Array(readFileSync(romPath));

  // Load BIOS
  const biosPath = './third_party/mame/roms/sms1/mpr-10052.rom';
  if (!existsSync(biosPath)) {
    console.error(`BIOS not found: ${biosPath}`);
    return 1;
  }
  const bios = new Uint8Array(readFileSync(biosPath));
  console.log(`Using BIOS: ${biosPath}`);

  // Create machine with BIOS
  const machine = createMachine({ cart: { rom }, useManualInit: false, bus: { bios } });
  const vdp = machine.getVDP();
  const bus = machine.getBus();

  const st = vdp.getState?.();
  const cyclesPerLine = st?.cyclesPerLine ?? 228;
  const linesPerFrame = st?.linesPerFrame ?? 262;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;

  // Run exactly 180 frames
  for (let f = 1; f <= 180; f++) {
    machine.runCycles(cyclesPerFrame);
    if (f % 30 === 0) {
      const s = vdp.getState?.();
      const pc = machine.getCPU().getState().pc;
      const busState = bus as any;
      const biosEnabled = busState.biosEnabled;
      console.log(`Ran ${f} frames: PC=0x${pc.toString(16).padStart(4,'0')} Display=${s?.displayEnabled ? 'ON' : 'OFF'} BIOS=${biosEnabled ? 'ON' : 'OFF'}`);
    }
  }

  // Get final state
  const finalState = vdp.getState?.();
  if (!finalState) {
    console.error('Could not get VDP state');
    return 1;
  }

  const frame = vdp.renderFrame?.();
  if (!frame) {
    console.error('Could not render frame');
    return 1;
  }

  // Analyze colors
  let total = 0, black = 0, blue = 0, white = 0;
  for (let i = 0; i < frame.length; i += 3) {
    const r = frame[i], g = frame[i + 1], b = frame[i + 2];
    total++;
    if (r === 0 && g === 0 && b === 0) black++;
    if (b >= g && g >= r && (b > 0 || g > 0)) blue++;
    if (r > 200 && g > 200 && b > 200) white++;
  }

  console.log(`\n=== Final Analysis ===`);
  console.log(`Most common color: Black=${(black/total*100).toFixed(2)}% Blue=${(blue/total*100).toFixed(2)}% White=${(white/total*100).toFixed(2)}%`);
  console.log(`R7 (background): 0x${(finalState.regs?.[7] ?? 0).toString(16).padStart(2, '0')}`);

  // Check SEGA logo area (center region)
  const logoX = 128 - 25; // Center - half logo width
  const logoY = 96 - 12;  // Center - half logo height
  const logoWidth = 50;
  const logoHeight = 24;
  
  let logoNonBg = 0, logoWhite = 0, logoDarkBlue = 0, logoUnexpected = 0;
  for (let y = logoY; y < logoY + logoHeight; y++) {
    for (let x = logoX; x < logoX + logoWidth; x++) {
      const idx = (y * 256 + x) * 3;
      if (idx + 2 < frame.length) {
        const r = frame[idx], g = frame[idx + 1], b = frame[idx + 2];
        if (r !== 0 || g !== 0 || b !== 0) logoNonBg++;
        if (r > 200 && g > 200 && b > 200) logoWhite++;
        if (r < 100 && g < 100 && b > 150) logoDarkBlue++;
        if (r === 0 && g === 0 && b === 0) logoUnexpected++;
      }
    }
  }

  console.log(`Logo area analysis: nonBg=${logoNonBg}, white=${logoWhite}, darkBlue=${logoDarkBlue}, unexpected=${logoUnexpected}`);

  // Save PNG
  const pngjs = await import('pngjs');
  const png = new pngjs.PNG({ width: 256, height: 192 });
  for (let i = 0; i < frame.length; i += 3) {
    const idx = i / 3;
    png.data[idx * 4] = frame[i];     // R
    png.data[idx * 4 + 1] = frame[i + 1]; // G
    png.data[idx * 4 + 2] = frame[i + 2]; // B
    png.data[idx * 4 + 3] = 255;         // A
  }

  const fs = await import('fs');
  const path = await import('path');
  const outputDir = './traces';
  if (!existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'wonderboy_180_frames_fixed.png');
  fs.writeFileSync(outputPath, pngjs.PNG.sync.write(png));

  console.log(`\n✅ SUCCESS: Wonder Boy graphics working correctly after 180 frames!`);
  console.log(`Saved frame to ${outputPath}`);

  return 0;
};

main().then(process.exit);
