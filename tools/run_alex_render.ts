import * as fs from 'fs';
import * as path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import { PNG } from 'pngjs';

console.log('=== Running Alex Kidd with Fixed LDIR ===\n');

// Find the Alex Kidd ROM
const romPaths = [
  './Alex Kidd - The Lost Stars (UE) [!].sms',
  './alex_kidd.sms',
  './alexkidd.sms',
  './test-roms/alexkidd.sms',
  './roms/alexkidd.sms',
];

let romPath: string | null = null;
for (const path of romPaths) {
  if (fs.existsSync(path)) {
    romPath = path;
    break;
  }
}

if (!romPath) {
  // Try to find any .sms file
  const files = fs.readdirSync('.');
  const smsFile = files.find(f => f.toLowerCase().includes('alex') && f.endsWith('.sms'));
  if (smsFile) {
    romPath = './' + smsFile;
  } else {
    console.error('Could not find Alex Kidd ROM file');
    console.log('Searched paths:', romPaths);
    process.exit(1);
  }
}

console.log(`Loading ROM from: ${romPath}`);
const rom = fs.readFileSync(romPath);
const cart: Cartridge = { rom: new Uint8Array(rom) };

// Create machine without fast blocks to ensure accuracy
const machine = createMachine({
  cart,
  fastBlocks: false,
});

const cpu = machine.getCPU();
const vdp = machine.getVDP();
const bus = machine.getBus();

// SMS screen dimensions
const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 192;
const CYCLES_PER_FRAME = 59736; // NTSC

console.log('Running emulation...\n');

// Run for a few seconds to let the game initialize
const FRAMES_TO_RUN = 180; // 3 seconds at 60fps

for (let frame = 0; frame < FRAMES_TO_RUN; frame++) {
  machine.runCycles(CYCLES_PER_FRAME);

  // Report progress every 30 frames (0.5 seconds)
  if (frame % 30 === 0) {
    const state = cpu.getState();
    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }

    console.log(`Frame ${frame}/${FRAMES_TO_RUN}:`);
    console.log(
      `  CPU: PC=0x${state.pc.toString(16).padStart(4, '0')}, SP=0x${state.sp.toString(16).padStart(4, '0')}`
    );
    console.log(`  VDP: Mode=${vdpState.mode}, BG Color=${vdpState.bgColor}`);

    // Count non-zero VRAM bytes
    let nonZeroCount = 0;
    for (let i = 0; i < 0x4000; i++) {
      if ((vdpState.vram[i] ?? 0) !== 0) nonZeroCount++;
    }
    console.log(`  VRAM: ${nonZeroCount}/16384 non-zero bytes (${((nonZeroCount / 16384) * 100).toFixed(1)}%)`);

    // Check if halted
    if (state.halted) {
      console.log('  ⚠️ CPU is halted');
    }
  }
}

console.log('\nRendering frame to PNG...');

// Get the current frame from VDP
const vdpState = vdp.getState?.();
if (!vdpState) {
  console.error('VDP state not available');
  process.exit(1);
}

// Create a PNG image
const png = new PNG({
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  filterType: -1,
});

// SMS/GG palette (approximation)
const smsPalette: Array<[number, number, number]> = [
  [0, 0, 0], // 0: Black
  [85, 0, 0], // 1: Dark Red
  [0, 85, 0], // 2: Dark Green
  [85, 85, 0], // 3: Dark Yellow
  [0, 0, 85], // 4: Dark Blue
  [85, 0, 85], // 5: Dark Magenta
  [0, 85, 85], // 6: Dark Cyan
  [85, 85, 85], // 7: Dark Gray
  [170, 170, 170], // 8: Light Gray
  [255, 85, 85], // 9: Red
  [85, 255, 85], // A: Green
  [255, 255, 85], // B: Yellow
  [85, 85, 255], // C: Blue
  [255, 85, 255], // D: Magenta
  [85, 255, 255], // E: Cyan
  [255, 255, 255], // F: White
];

// Get palette from CRAM (Color RAM)
const cram = vdpState.cram || new Uint8Array(32);
const palette: Array<[number, number, number]> = [];

for (let i = 0; i < 32; i++) {
  const color = (cram[i] ?? 0) & 0x3f;
  // SMS color format: 00BBGGRR (2 bits per channel)
  const r = ((color & 0x03) * 85) | 0;
  const g = (((color >> 2) & 0x03) * 85) | 0;
  const b = (((color >> 4) & 0x03) * 85) | 0;
  palette.push([r, g, b]);
}

// Simple rendering: try to show pattern table or name table
// This is a simplified renderer just to see if any graphics are loaded

// Check if we have a framebuffer
if (vdpState.frameBuffer && vdpState.frameBuffer.length > 0) {
  console.log('Using VDP framebuffer');
  // Use the VDP's rendered framebuffer
  for (let y = 0; y < SCREEN_HEIGHT; y++) {
    for (let x = 0; x < SCREEN_WIDTH; x++) {
      const idx = (y * SCREEN_WIDTH + x) << 2;
      const fbIdx = y * SCREEN_WIDTH + x;
      const colorIdx = vdpState.frameBuffer[fbIdx] & 0x1f;
      const [r, g, b] = palette[colorIdx] || [0, 0, 0];

      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255; // Alpha
    }
  }
} else {
  console.log('No framebuffer, rendering pattern table directly');
  // Fallback: render pattern table directly (first 256 tiles)
  const vram = vdpState.vram;
  const tilesPerRow = 32;
  const tileSize = 8;

  for (let tileY = 0; tileY < 24; tileY++) {
    for (let tileX = 0; tileX < 32; tileX++) {
      const tileNum = tileY * tilesPerRow + tileX;
      if (tileNum >= 256) break;

      const tileAddr = tileNum * 32; // Each tile is 32 bytes

      // Render the tile
      for (let py = 0; py < 8; py++) {
        const y = tileY * 8 + py;
        if (y >= SCREEN_HEIGHT) break;

        for (let px = 0; px < 8; px++) {
          const x = tileX * 8 + px;
          if (x >= SCREEN_WIDTH) break;

          // Get the 4 bytes for this line of the tile
          const lineAddr = tileAddr + py * 4;
          const b0 = vram[lineAddr] || 0;
          const b1 = vram[lineAddr + 1] || 0;
          const b2 = vram[lineAddr + 2] || 0;
          const b3 = vram[lineAddr + 3] || 0;

          // Extract the pixel (bit 7-px of each byte)
          const bit = 7 - px;
          const p0 = (b0 >> bit) & 1;
          const p1 = (b1 >> bit) & 1;
          const p2 = (b2 >> bit) & 1;
          const p3 = (b3 >> bit) & 1;

          const colorIdx = p0 | (p1 << 1) | (p2 << 2) | (p3 << 3);
          const [r, g, b] = palette[colorIdx] || smsPalette[colorIdx] || [0, 0, 0];

          const idx = (y * SCREEN_WIDTH + x) << 2;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = 255;
        }
      }
    }
  }
}

// Save the PNG
const outputPath = 'alex_kidd_fixed.png';
const buffer = PNG.sync.write(png);
fs.writeFileSync(outputPath, buffer);

console.log(`\nFrame saved to: ${outputPath}`);

// Final status report
const finalCpuState = cpu.getState();
const finalVdpState = vdp?.getState?.() ?? {};

console.log('\n=== Final Status ===');
console.log(`CPU: PC=0x${finalCpuState.pc.toString(16).padStart(4, '0')}, Halted=${finalCpuState.halted}`);

// Check RAM for signs of life
let ramNonZero = 0;
for (let i = 0xc000; i <= 0xdfff; i++) {
  if (bus.read8(i) !== 0) ramNonZero++;
}
console.log(`RAM: ${ramNonZero}/8192 non-zero bytes (${((ramNonZero / 8192) * 100).toFixed(1)}%)`);

// Check VRAM
let vramNonZero = 0;
let patternNonZero = 0;
let nameTableNonZero = 0;

for (let i = 0; i < 0x4000; i++) {
  if (finalVdpState.vram[i] !== 0) {
    vramNonZero++;
    if (i < 0x2000) patternNonZero++;
    if (i >= 0x3800 && i < 0x3b00) nameTableNonZero++;
  }
}

console.log(`VRAM: ${vramNonZero}/16384 non-zero bytes (${((vramNonZero / 16384) * 100).toFixed(1)}%)`);
console.log(`  Pattern area: ${patternNonZero}/8192 bytes`);
console.log(`  Name table: ${nameTableNonZero}/768 bytes`);

if (vramNonZero > 1000) {
  console.log('\n✅ Game appears to have loaded graphics!');
} else {
  console.log('\n⚠️ Very little graphics data in VRAM');
}

console.log('\n=== Complete ===');
