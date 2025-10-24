import * as fs from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import { PNG } from 'pngjs';

console.log('=== Extended Alex Kidd Test ===\n');

const romPath = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = fs.readFileSync(romPath);
const cart: Cartridge = { rom: new Uint8Array(rom) };

// Create machine
const machine = createMachine({
  cart,
  fastBlocks: false,
});

const cpu = machine.getCPU();
const vdp = machine.getVDP();
const bus = machine.getBus();

const SCREEN_WIDTH = 256;
const SCREEN_HEIGHT = 192;
const CYCLES_PER_FRAME = 59736;

// Run for 10 seconds
const FRAMES_TO_RUN = 600; // 10 seconds at 60fps

console.log('Running emulation for 10 seconds...\n');

let lastPC = 0;
let stuckCount = 0;
let bankSwitches = 0;
let lastBank = -1;

for (let frame = 0; frame < FRAMES_TO_RUN; frame++) {
  machine.runCycles(CYCLES_PER_FRAME);

  const state = cpu.getState();

  // Detect if stuck
  if (state.pc === lastPC) {
    stuckCount++;
  } else {
    stuckCount = 0;
    lastPC = state.pc;
  }

  // Check current ROM bank (if PC is in banked area)
  if (state.pc >= 0x8000) {
    const currentBank = bus.read8(0xfffe) & 0x1f; // Read bank register
    if (currentBank !== lastBank) {
      bankSwitches++;
      lastBank = currentBank;
    }
  }

  // Report every second (60 frames)
  if (frame % 60 === 0) {
    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }
    const seconds = frame / 60;

    console.log(`=== ${seconds} seconds ===`);
    console.log(`PC: 0x${state.pc.toString(16).padStart(4, '0')}, SP: 0x${state.sp.toString(16).padStart(4, '0')}`);

    // Check VDP registers
    if (vdpState.regs) {
      console.log(
        `VDP Regs: ${vdpState.regs
          .slice(0, 11)
          .map((r: any) => r.toString(16).padStart(2, '0'))
          .join(' ')}`
      );
      const displayEnabled = ((vdpState.regs?.[1] ?? 0 ?? 0) & 0x40) !== 0;
      console.log(`  Display: ${displayEnabled ? 'ON' : 'OFF'}`);
    }

    // Count VRAM usage
    const vramUsage = new Array(16).fill(0);
    for (let i = 0; i < 0x4000; i++) {
      if ((vdpState.vram[i] ?? 0) !== 0) {
        vramUsage[Math.floor(i / 0x1000)]++;
      }
    }
    console.log(
      `VRAM usage by 4KB region: ${vramUsage.map((v: any) => `${((v / 0x1000) * 100).toFixed(0)}%`).join(' ')}`
    );

    // Check specific VRAM regions
    let patternCount = 0;
    let nameTableCount = 0;
    let spriteTableCount = 0;

    // Pattern data (0x0000-0x1FFF)
    for (let i = 0; i < 0x2000; i++) {
      if ((vdpState.vram[i] ?? 0) !== 0) patternCount++;
    }

    // Name table (usually 0x3800-0x3AFF)
    for (let i = 0x3800; i < 0x3b00; i++) {
      if ((vdpState.vram[i] ?? 0) !== 0) nameTableCount++;
    }

    // Sprite table (usually 0x3F00-0x3FFF)
    for (let i = 0x3f00; i < 0x4000; i++) {
      if ((vdpState.vram[i] ?? 0) !== 0) spriteTableCount++;
    }

    console.log(
      `  Patterns: ${patternCount}/8192, Name Table: ${nameTableCount}/768, Sprites: ${spriteTableCount}/256`
    );

    // RAM usage
    const ramUsage = [0, 0]; // C000-CFFF, D000-DFFF
    for (let i = 0xc000; i < 0xe000; i++) {
      const val = bus.read8(i);
      if (val !== 0) {
        if (i < 0xd000) ramUsage[0]++;
        else ramUsage[1]++;
      }
    }
    console.log(`RAM usage: C000-CFFF: ${ramUsage[0]}/4096, D000-DFFF: ${ramUsage[1]}/4096`);

    if (stuckCount > 60) {
      console.log(`⚠️ CPU appears stuck at PC=0x${state.pc.toString(16).padStart(4, '0')} for ${stuckCount} frames`);
    }

    console.log(`Bank switches so far: ${bankSwitches}`);
    console.log('');
  }

  // Stop if really stuck
  if (stuckCount > 300) {
    console.log('\n❌ CPU is stuck, stopping emulation');
    break;
  }
}

console.log('\n=== Rendering final frame ===');

const vdpState = vdp.getState?.();
if (!vdpState) {
  console.error('VDP state not available');
  process.exit(1);
}
const png = new PNG({
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  filterType: -1,
});

// Get palette
const cram = vdpState.cram || new Uint8Array(32);
const palette: Array<[number, number, number]> = [];

for (let i = 0; i < 32; i++) {
  const color = (cram[i] ?? 0) & 0x3f;
  const r = ((color & 0x03) * 85) | 0;
  const g = (((color >> 2) & 0x03) * 85) | 0;
  const b = (((color >> 4) & 0x03) * 85) | 0;
  palette.push([r, g, b]);
}

// Try to render the name table if we have one
const vram = vdpState.vram;
const nameTableAddr = 0x3800;
const patternTableAddr = 0x0000;

console.log('Rendering name table tiles...');

for (let row = 0; row < 24; row++) {
  for (let col = 0; col < 32; col++) {
    const nameIdx = nameTableAddr + row * 64 + col * 2; // Each entry is 2 bytes
    const tileLo = vram[nameIdx] || 0;
    const tileHi = vram[nameIdx + 1] || 0;
    const tileNum = tileLo | ((tileHi & 0x01) << 8);
    const paletteSelect = (tileHi >> 3) & 1;
    const hFlip = (tileHi & 0x02) !== 0;
    const vFlip = (tileHi & 0x04) !== 0;

    // Get the tile pattern
    const tileAddr = patternTableAddr + tileNum * 32;

    for (let py = 0; py < 8; py++) {
      const y = row * 8 + (vFlip ? 7 - py : py);
      if (y >= SCREEN_HEIGHT) continue;

      const lineAddr = tileAddr + py * 4;
      const b0 = vram[lineAddr] || 0;
      const b1 = vram[lineAddr + 1] || 0;
      const b2 = vram[lineAddr + 2] || 0;
      const b3 = vram[lineAddr + 3] || 0;

      for (let px = 0; px < 8; px++) {
        const x = col * 8 + (hFlip ? 7 - px : px);
        if (x >= SCREEN_WIDTH) continue;

        const bit = 7 - px;
        const p0 = (b0 >> bit) & 1;
        const p1 = (b1 >> bit) & 1;
        const p2 = (b2 >> bit) & 1;
        const p3 = (b3 >> bit) & 1;

        const colorIdx = p0 | (p1 << 1) | (p2 << 2) | (p3 << 3);
        const paletteIdx = paletteSelect * 16 + colorIdx;
        const [r, g, b] = palette[paletteIdx] || [0, 0, 0];

        const idx = (y * SCREEN_WIDTH + x) << 2;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }
  }
}

// Save PNG
const outputPath = 'alex_kidd_extended.png';
const buffer = PNG.sync.write(png);
fs.writeFileSync(outputPath, buffer);
console.log(`Saved to: ${outputPath}`);

// Final report
const finalState = cpu.getState();
console.log('\n=== Final State ===');
console.log(`CPU: PC=0x${finalState.pc.toString(16).padStart(4, '0')}, Halted=${finalState.halted}`);
console.log(`Total bank switches: ${bankSwitches}`);

// Check if we reached game code
if (finalState.pc >= 0x8000) {
  console.log('✅ Reached banked ROM area');
} else if (finalState.pc >= 0x0400) {
  console.log('⚠️ Still in fixed ROM area');
} else {
  console.log('❌ Still in initialization/interrupt handlers');
}

// Check VRAM content
let totalVramUsed = 0;
for (let i = 0; i < 0x4000; i++) {
  if (vram[i] !== 0) totalVramUsed++;
}

if (totalVramUsed > 4000) {
  console.log(`✅ Significant VRAM usage: ${totalVramUsed}/16384 bytes`);
} else if (totalVramUsed > 1000) {
  console.log(`⚠️ Some VRAM usage: ${totalVramUsed}/16384 bytes`);
} else {
  console.log(`❌ Very little VRAM usage: ${totalVramUsed}/16384 bytes`);
}

console.log('\n=== Complete ===');
