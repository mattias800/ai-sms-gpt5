#!/usr/bin/env tsx

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = (): number => {
  console.log('Detailed Wonder Boy debugging\n');

  // Load ROM and BIOS
  const romData = readFileSync('wonderboy5.sms');
  let biosData: Uint8Array;
  try {
    biosData = new Uint8Array(readFileSync('./mpr-10052.rom'));
  } catch {
    try {
      biosData = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
    } catch {
      biosData = new Uint8Array(readFileSync('bios13fx.sms'));
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
  }

  const finalState = vdp.getState?.();
  if (!finalState) {
    console.error('Could not get VDP state');
    return 1;
  }

  const vram = vdp.getVRAM();
  const cram = vdp.getCRAM();

  // Analyze name table
  const nameTableBase = (((finalState.regs[2] ?? 0) >> 1) & 0x07) << 11;
  console.log(`Name table base: 0x${nameTableBase.toString(16)}`);
  
  console.log('\n=== Name Table Analysis (first 32x24 tiles) ===');
  for (let ty = 0; ty < 24; ty++) {
    let line = `Y${ty.toString().padStart(2)}: `;
    for (let tx = 0; tx < 32; tx++) {
      const nameIdx = ty * 32 + tx;
      const nameAddr = (nameTableBase + nameIdx * 2) & 0x3fff;
      const nameLow = vram[nameAddr] ?? 0;
      const nameHigh = vram[nameAddr + 1] ?? 0;
      const tileNum = nameLow | ((nameHigh & 0x01) << 8);
      const priority = (nameHigh & 0x08) !== 0;
      const hFlip = (nameHigh & 0x02) !== 0;
      const vFlip = (nameHigh & 0x04) !== 0;
      
      if (tileNum !== 0 || priority || hFlip || vFlip) {
        line += `[${tileNum.toString().padStart(3)}${priority?'P':''}${hFlip?'H':''}${vFlip?'V':''}] `;
      } else {
        line += `[  0] `;
      }
    }
    console.log(line);
  }

  // Analyze pattern table
  console.log('\n=== Pattern Table Analysis (first 16 tiles) ===');
  for (let tile = 0; tile < 16; tile++) {
    const tileAddr = tile * 32;
    let hasData = false;
    for (let i = 0; i < 32; i++) {
      if (vram[tileAddr + i] !== 0) {
        hasData = true;
        break;
      }
    }
    
    if (hasData) {
      console.log(`Tile ${tile}:`);
      for (let row = 0; row < 8; row++) {
        const rowAddr = tileAddr + row * 4;
        const plane0 = vram[rowAddr] ?? 0;
        const plane1 = vram[rowAddr + 1] ?? 0;
        const plane2 = vram[rowAddr + 2] ?? 0;
        const plane3 = vram[rowAddr + 3] ?? 0;
        
        let line = `  Row ${row}: `;
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

  // Check what the renderer is actually doing
  console.log('\n=== Renderer Debug ===');
  if (vdp.renderFrame) {
    const frame = vdp.renderFrame();
    
    // Check center 10x10 area
    const centerX = 128, centerY = 96;
    console.log('Center 10x10 area colors:');
    for (let y = centerY - 5; y < centerY + 5; y++) {
      let line = `Y${y}: `;
      for (let x = centerX - 5; x < centerX + 5; x++) {
        const idx = (y * 256 + x) * 3;
        const r = frame[idx] ?? 0;
        const g = frame[idx + 1] ?? 0;
        const b = frame[idx + 2] ?? 0;
        if (r === 0 && g === 0 && b === 0) {
          line += 'K '; // Black
        } else if (r === 170 && g === 255 && b === 255) {
          line += 'B '; // Light blue
        } else if (r === 255 && g === 255 && b === 255) {
          line += 'W '; // White
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
