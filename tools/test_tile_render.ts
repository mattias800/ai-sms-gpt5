#!/usr/bin/env npx tsx
import { createMachine } from '../src/machine/machine.js';
import { createCanvas } from 'canvas';
import * as fs from 'fs';

const romPath = process.argv[2] || 'alexkidd.sms';

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

// Run until display is on with content
for (let frame = 0; frame < 500; frame++) {
  machine.runCycles(59736);

  const vdp = machine.getVDP();
  if (vdp.getState) {
    const state = vdp?.getState?.() ?? {};

    // Check for content
    let nonZeroEntries = 0;
    const nameBase = state.nameTableBase;
    for (let i = 0; i < 768; i++) {
      const addr = nameBase + i * 2;
      const low = state.vram[addr];
      const high = state.vram[addr + 1];
      if (low !== 0 || high !== 0) nonZeroEntries++;
    }

    if (state.displayEnabled && nonZeroEntries > 100) {
      console.log(`\nFound content at frame ${frame}`);
      console.log(`Name table entries: ${nonZeroEntries}/768`);

      // Test render with pattern base at 0x0000
      console.log('\nTesting with pattern base 0x0000:');
      testRender(state, 0x0000, 'test_0000.png');

      // Test render with pattern base at 0x2000
      console.log('\nTesting with pattern base 0x2000:');
      testRender(state, 0x2000, 'test_2000.png');

      break;
    }
  }
}

function testRender(state: any, patternBase: number, filename: string) {
  const canvas = createCanvas(256, 192);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(256, 192);

  // Convert palette
  const paletteToRGB = (idx: number): [number, number, number] => {
    const entry = state.cram[idx & 0x1f] & 0x3f;
    const r = (entry & 0x03) * 85;
    const g = ((entry >> 2) & 0x03) * 85;
    const b = ((entry >> 4) & 0x03) * 85;
    return [r, g, b];
  };

  // Clear to background
  const bgColor = (state.regs[7] ?? 0) & 0x0f;
  const [bgR, bgG, bgB] = paletteToRGB(bgColor);
  for (let i = 0; i < 256 * 192 * 4; i += 4) {
    imageData.data[i] = bgR;
    imageData.data[i + 1] = bgG;
    imageData.data[i + 2] = bgB;
    imageData.data[i + 3] = 255;
  }

  // Render tiles
  const nameBase = state.nameTableBase;
  let tilesRendered = 0;

  for (let ty = 0; ty < 24; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const nameIdx = ty * 32 + tx;
      const nameAddr = nameBase + nameIdx * 2;

      const nameLow = state.vram[nameAddr];
      const nameHigh = state.vram[nameAddr + 1];
      const tileNum = nameLow | ((nameHigh & 0x01) << 8);

      if (tileNum === 0) continue;
      tilesRendered++;

      const palette = (nameHigh & 0x08) !== 0 ? 1 : 0;
      const tileAddr = patternBase + tileNum * 32;

      // Render tile
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const rowAddr = tileAddr + py * 4;
          const bit = 7 - px;

          const plane0 = (state.vram[rowAddr] >> bit) & 1;
          const plane1 = (state.vram[rowAddr + 1] >> bit) & 1;
          const plane2 = (state.vram[rowAddr + 2] >> bit) & 1;
          const plane3 = (state.vram[rowAddr + 3] >> bit) & 1;

          const colorIdx = plane0 | (plane1 << 1) | (plane2 << 2) | (plane3 << 3);
          if (colorIdx === 0) continue;

          const fx = tx * 8 + px;
          const fy = ty * 8 + py;
          if (fx >= 256 || fy >= 192) continue;

          const fbIdx = (fy * 256 + fx) * 4;
          const palOffset = palette ? 16 : 0;
          const [r, g, b] = paletteToRGB(palOffset + colorIdx);

          imageData.data[fbIdx] = r;
          imageData.data[fbIdx + 1] = g;
          imageData.data[fbIdx + 2] = b;
          imageData.data[fbIdx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  fs.writeFileSync(filename, canvas.toBuffer());
  console.log(`  Rendered ${tilesRendered} tiles to ${filename}`);
}
