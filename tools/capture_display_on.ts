#!/usr/bin/env npx tsx
import { createMachine } from '../src/machine/machine.js';
import { createCanvas } from 'canvas';
import * as fs from 'fs';

const romPath = process.argv[2] || 'alexkidd.sms';
const maxFrames = parseInt(process.argv[3] || '1000');

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

let displayOnFrame = -1;
let capturedFrame: Uint8Array | null = null;

// Run frames until display turns on with content
for (let frame = 0; frame < maxFrames; frame++) {
  machine.runCycles(59736);

  const vdp = machine.getVDP();
  if (vdp.getRegister && vdp.getState) {
    const r1 = vdp.getRegister(1);
    const displayOn = (r1 & 0x40) !== 0;

    // Check if there's content in name table
    const state = vdp?.getState?.() ?? {};
    let nonZeroEntries = 0;
    const nameBase = state.nameTableBase;
    for (let i = 0; i < 768; i++) {
      const addr = nameBase + i * 2;
      const low = state.vram[addr];
      const high = state.vram[addr + 1];
      if (low !== 0 || high !== 0) {
        nonZeroEntries++;
      }
    }

    // Capture when display is ON and there's content
    if (displayOn && nonZeroEntries > 100 && displayOnFrame === -1) {
      displayOnFrame = frame;
      console.log(`Display turned ON at frame ${frame}`);

      // Capture this frame
      if (vdp.renderFrame) {
        capturedFrame = vdp.renderFrame();
      }

      // Show VDP state
      if (vdp.getState) {
        const state = vdp?.getState?.() ?? {};
        console.log('\nVDP Registers when display ON:');
        for (let i = 0; i < 11; i++) {
          console.log(`  R${i}: 0x${state.regs[i].toString(16).padStart(2, '0')}`);
        }
        console.log(`\nName Table: 0x${state.nameTableBase.toString(16)}`);
        console.log(`Pattern Base: 0x${state.bgPatternBase.toString(16)}`);

        // Check name table content
        let nonZeroEntries = 0;
        const nameBase = state.nameTableBase;
        for (let i = 0; i < 768; i++) {
          // 32x24 tiles
          const addr = nameBase + i * 2;
          const low = state.vram[addr];
          const high = state.vram[addr + 1];
          if (low !== 0 || high !== 0) {
            nonZeroEntries++;
          }
        }
        console.log(`Non-zero name table entries: ${nonZeroEntries}/768`);

        // Check pattern data at pattern base
        let nonZeroPatterns = 0;
        const patternBase = state.bgPatternBase;
        for (let tile = 0; tile < 512; tile++) {
          const tileAddr = patternBase + tile * 32;
          let hasData = false;
          for (let i = 0; i < 32; i++) {
            if (state.vram[tileAddr + i] !== 0) {
              hasData = true;
              break;
            }
          }
          if (hasData) nonZeroPatterns++;
        }
        console.log(`Non-zero patterns at base: ${nonZeroPatterns}/512`);
      }
      break;
    }
  }
}

if (displayOnFrame === -1) {
  console.log('Display never turned ON');
} else if (capturedFrame) {
  // Save the captured frame
  const canvas = createCanvas(256, 192);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(256, 192);

  for (let i = 0; i < 256 * 192; i++) {
    imageData.data[i * 4] = capturedFrame[i * 3] ?? 0;
    imageData.data[i * 4 + 1] = capturedFrame[i * 3 + 1] ?? 0;
    imageData.data[i * 4 + 2] = capturedFrame[i * 3 + 2] ?? 0;
    imageData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  fs.writeFileSync('display_on.png', canvas.toBuffer());
  console.log('\nSaved to: display_on.png');
}
