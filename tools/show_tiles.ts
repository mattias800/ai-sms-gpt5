import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

function showTiles(romPath: string, gameName: string): void {
  const rom = new Uint8Array(readFileSync(romPath));
  const cart: Cartridge = { rom };

  const m = createMachine({
    cart,
    wait: undefined,
    bus: { allowCartRam: false },
    fastBlocks: true,
    trace: undefined,
  });

  // Run for 15 seconds
  const vdp = m.getVDP();
  const st0 = vdp.getState ? vdp.getState?.() : undefined;
  const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
  const totalFrames = 900;

  console.log(`Running ${gameName} for ${totalFrames} frames...`);
  for (let frame = 0; frame < totalFrames; frame++) {
    m.runCycles(cyclesPerFrame);
  }

  const st = vdp.getState ? vdp.getState?.()! : undefined;
  if (!st || !st.vram || !st.cram) {
    throw new Error('VDP state not available');
  }

  console.log(`\n=== ${gameName} Tile Analysis ===`);
  console.log(`Display: ${st.displayEnabled ? 'ON' : 'OFF'}`);
  console.log(`Name table: 0x${st.nameTableBase.toString(16).padStart(4, '0')}`);
  console.log(`Pattern base: 0x${st.bgPatternBase.toString(16).padStart(4, '0')}`);

  // Show CRAM palette
  console.log('\nPalette (first 16 colors):');
  for (let i = 0; i < 16; i++) {
    const val = (st.cram[i] ?? 0) & 0x3f;
    const r = val & 0x03;
    const g = (val >> 2) & 0x03;
    const b = (val >> 4) & 0x03;
    console.log(`  [${i.toString().padStart(2)}]: RGB(${r},${g},${b}) = 0x${val.toString(16).padStart(2, '0')}`);
  }

  // Show first few name table entries
  console.log('\nFirst 8 name table entries:');
  const nameBase = st.nameTableBase & 0x3fff;
  for (let i = 0; i < 8; i++) {
    const addr = (nameBase + i * 2) & 0x3fff;
    const low = st.vram[addr] ?? 0;
    const high = st.vram[addr + 1] ?? 0;
    const tileIdx = ((high & 0x03) << 8) | low;
    console.log(`  Entry ${i}: tile=${tileIdx.toString().padStart(3)} flags=0x${high.toString(16).padStart(2, '0')}`);
  }

  // Show pattern for tile 1 (if exists)
  console.log('\nPattern for tile 1:');
  const pattBase = st.bgPatternBase & 0x3fff;
  const tile1Addr = (pattBase + 32) & 0x3fff; // 32 bytes per tile

  for (let row = 0; row < 8; row++) {
    const b0 = st.vram[(tile1Addr + row * 4) & 0x3fff] ?? 0;
    const b1 = st.vram[(tile1Addr + row * 4 + 1) & 0x3fff] ?? 0;
    const b2 = st.vram[(tile1Addr + row * 4 + 2) & 0x3fff] ?? 0;
    const b3 = st.vram[(tile1Addr + row * 4 + 3) & 0x3fff] ?? 0;

    let line = '  ';
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      const ci = ((b0 >>> bit) & 1) | (((b1 >>> bit) & 1) << 1) | (((b2 >>> bit) & 1) << 2) | (((b3 >>> bit) & 1) << 3);
      line += ci.toString(16);
    }
    console.log(line);
  }
}

// Analyze both games
showTiles('./sonic.sms', 'Sonic');
console.log('\n' + '='.repeat(50) + '\n');
showTiles('./alexkidd.sms', 'Alex Kidd');
