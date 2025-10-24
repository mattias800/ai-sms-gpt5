import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import { SmsBus } from '../src/bus/bus.js';
import type { Cartridge } from '../src/bus/bus.js';
import { PNG } from 'pngjs';

const WIDTH = 256;
const HEIGHT = 192;

function rgbFromCram(val: number): [number, number, number] {
  // SMS/GG 6-bit RGB: 00BBGGRR
  const r = (val & 0x03) * 85;
  const g = ((val >>> 2) & 0x03) * 85;
  const b = ((val >>> 4) & 0x03) * 85;
  return [r, g, b];
}

function renderFrame(
  vram: Uint8Array | number[],
  cram: Uint8Array | number[],
  nameBase: number,
  patternBase: number
): Uint8Array {
  const v = vram instanceof Uint8Array ? vram : Uint8Array.from(vram);
  const c = cram instanceof Uint8Array ? cram : Uint8Array.from(cram);
  const out = new Uint8Array(WIDTH * HEIGHT * 3);

  // Render background tiles
  for (let ty = 0; ty < 24; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const entryAddr = (nameBase + ((ty * 32 + tx) << 1)) & 0x3fff;
      const low = (v[entryAddr] ?? 0) & 0xff;
      const high = (v[(entryAddr + 1) & 0x3fff] ?? 0) & 0xff;
      const tileIndex = ((high & 0x03) << 8) | low;
      const pattAddr = (patternBase + (tileIndex << 5)) & 0x3fff;

      for (let row = 0; row < 8; row++) {
        const b0 = (v[(pattAddr + row * 4) & 0x3fff] ?? 0) & 0xff;
        const b1 = (v[(pattAddr + row * 4 + 1) & 0x3fff] ?? 0) & 0xff;
        const b2 = (v[(pattAddr + row * 4 + 2) & 0x3fff] ?? 0) & 0xff;
        const b3 = (v[(pattAddr + row * 4 + 3) & 0x3fff] ?? 0) & 0xff;
        const py = ty * 8 + row;
        if (py >= HEIGHT) continue;

        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const ci =
            ((b0 >>> bit) & 1) | (((b1 >>> bit) & 1) << 1) | (((b2 >>> bit) & 1) << 2) | (((b3 >>> bit) & 1) << 3);
          const cramIdx = ci & 0x1f;
          const cramVal = (c[cramIdx] ?? 0) & 0x3f;
          const [r, g, b] = rgbFromCram(cramVal);
          const px = tx * 8 + col;
          if (px >= WIDTH) continue;
          const off = (py * WIDTH + px) * 3;
          out[off] = r;
          out[off + 1] = g;
          out[off + 2] = b;
        }
      }
    }
  }
  return out;
}

function captureScreenshot(romPath: string, outPath: string, seconds: number): void {
  const rom = new Uint8Array(readFileSync(romPath));
  const cart: Cartridge = { rom };

  const m = createMachine({
    cart,
    wait: undefined,
    bus: { allowCartRam: false },
    fastBlocks: true,
    trace: undefined,
  });

  // Run for specified time
  const vdp = m.getVDP();
  const st0 = vdp.getState ? vdp.getState?.() : undefined;
  const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
  const totalFrames = Math.floor(seconds * 60);

  console.log(`Running ${romPath} for ${totalFrames} frames...`);

  for (let frame = 0; frame < totalFrames; frame++) {
    m.runCycles(cyclesPerFrame);

    // Log progress every 60 frames (1 second)
    if ((frame + 1) % 60 === 0) {
      const st = vdp.getState ? vdp.getState?.() : undefined;
      if (st) {
        console.log(
          `  ${frame + 1} frames: display=${st.displayEnabled}, vramWrites=${st.vramWrites}, cramWrites=${st.cramWrites}`
        );
      }
    }
  }

  // Capture final frame
  const st = vdp.getState ? vdp.getState?.()! : undefined;
  if (!st || !st.vram || !st.cram) {
    throw new Error('VDP state not available');
  }

  console.log('Final VDP state:');
  console.log(`  Display enabled: ${st.displayEnabled}`);
  console.log(`  VRAM writes: ${st.vramWrites}`);
  console.log(`  CRAM writes: ${st.cramWrites}`);
  console.log(`  Name table base: 0x${st.nameTableBase.toString(16)}`);
  console.log(`  Pattern base: 0x${st.bgPatternBase.toString(16)}`);

  // Check CRAM content
  let nonZeroCram = 0;
  for (let i = 0; i < 32; i++) {
    if (st.cram[i] !== 0) nonZeroCram++;
  }
  console.log(`  Non-zero CRAM entries: ${nonZeroCram}/32`);

  // Render the frame
  const rgb = renderFrame(st.vram, st.cram, st.nameTableBase & 0x3fff, st.bgPatternBase & 0x3fff);

  // Count non-zero pixels
  let nonZeroPixels = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    if (rgb[i] !== 0 || rgb[i + 1] !== 0 || rgb[i + 2] !== 0) {
      nonZeroPixels++;
    }
  }
  console.log(`  Non-zero pixels: ${nonZeroPixels}/${WIDTH * HEIGHT}`);

  // Write PNG using pngjs
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (WIDTH * y + x) << 2;
      const srcIdx = (WIDTH * y + x) * 3;
      png.data[idx] = rgb[srcIdx] ?? 0;
      png.data[idx + 1] = rgb[srcIdx + 1];
      png.data[idx + 2] = rgb[srcIdx + 2];
      png.data[idx + 3] = 255; // Alpha
    }
  }

  const buffer = PNG.sync.write(png);
  writeFileSync(outPath, buffer);
  console.log(`Wrote ${outPath}`);
}

// Run both games
console.log('=== Capturing Sonic ===');
captureScreenshot('./sonic.sms', 'sonic_screen.png', 15);

console.log('\n=== Capturing Alex Kidd ===');
captureScreenshot('./alexkidd.sms', 'alex_screen.png', 15);

console.log('\nDone!');
