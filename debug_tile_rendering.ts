#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Debug tile rendering in Wonder Boy\n');

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

  // Analyze the SEGA logo area (rows 8-11, columns 11-20)
  console.log('\n=== SEGA Logo Area Analysis ===');
  const nameTableBase = (((finalState.regs[2] ?? 0) >> 1) & 0x07) << 11;
  console.log(`Name table base: 0x${nameTableBase.toString(16)}`);
  
  for (let ty = 8; ty <= 11; ty++) {
    console.log(`\nRow ${ty}:`);
    for (let tx = 11; tx <= 20; tx++) {
      const nameIdx = ty * 32 + tx;
      const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;
      const nameLow = vram[nameAddr] ?? 0;
      const nameHigh = vram[nameAddr + 1] ?? 0;
      const tileNum = nameLow | ((nameHigh & 0x01) << 8);
      const priority = (nameHigh & 0x08) !== 0;
      const hFlip = (nameHigh & 0x02) !== 0;
      const vFlip = (nameHigh & 0x04) !== 0;
      
      console.log(`  Tile ${tx}: num=${tileNum} P=${priority?'1':'0'} H=${hFlip?'1':'0'} V=${vFlip?'1':'0'}`);
      
      // Analyze the tile pattern
      if (tileNum !== 0) {
        const tileAddr = tileNum * 32;
        console.log(`    Pattern data:`);
        for (let row = 0; row < 8; row++) {
          const rowAddr = tileAddr + row * 4;
          const plane0 = vram[rowAddr] ?? 0;
          const plane1 = vram[rowAddr + 1] ?? 0;
          const plane2 = vram[rowAddr + 2] ?? 0;
          const plane3 = vram[rowAddr + 3] ?? 0;
          
          let line = `      Row ${row}: `;
          for (let col = 0; col < 8; col++) {
            const bit = 7 - col;
            const colorIdx = ((plane0 >> bit) & 1) | 
                            (((plane1 >> bit) & 1) << 1) | 
                            (((plane2 >> bit) & 1) << 2) | 
                            (((plane3 >> bit) & 1) << 3);
            line += colorIdx.toString(16);
          }
          console.log(line);
        }
      }
    }
  }

  // Check what colors are being used
  console.log('\n=== Color Analysis ===');
  console.log('CRAM entries:');
  for (let i = 0; i < 8; i++) {
    const entry = cram[i] ?? 0;
    const r = ((entry & 0x03) * 85) & 0xff;
    const g = (((entry >> 2) & 0x03) * 85) & 0xff;
    const b = (((entry >> 4) & 0x03) * 85) & 0xff;
    console.log(`  [${i}]: 0x${entry.toString(16).padStart(2, '0')} -> RGB(${r},${g},${b})`);
  }

  // Try to render a frame and check the center area
  if (vdp.renderFrame) {
    const frame = vdp.renderFrame();
    console.log('\n=== Center Area Colors ===');
    const centerX = 128, centerY = 96;
    for (let y = centerY - 5; y < centerY + 5; y++) {
      let line = `Y${y}: `;
      for (let x = centerX - 5; x < centerX + 5; x++) {
        const idx = (y * 256 + x) * 3;
        const r = frame[idx] ?? 0;
        const g = frame[idx + 1] ?? 0;
        const b = frame[idx + 2] ?? 0;
        if (r === 170 && g === 255 && b === 255) {
          line += 'B '; // Light blue background
        } else if (r === 255 && g === 255 && b === 255) {
          line += 'W '; // White
        } else if (r === 0 && g === 0 && b === 0) {
          line += 'K '; // Black
        } else {
          line += `${r.toString(16)}${g.toString(16)}${b.toString(16)} `;
        }
      }
      console.log(line);
    }
  }

  return 0;
};

const code = main();
process.exit(code);
