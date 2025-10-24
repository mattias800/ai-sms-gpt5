import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Final Analysis: What Gets Written to VRAM ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();

// Run for 420 frames as we did before
const CYCLES_PER_FRAME = 59736;
console.log('Running for 420 frames...\n');

for (let frame = 0; frame < 420; frame++) {
  let cyclesInFrame = 0;
  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
  }

  if (frame % 60 === 0) {
    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }
    const cpuState = cpu.getState();
    if (vdpState) {
      console.log(
        `Frame ${frame}: PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, VRAM writes=${vdpState.vramWrites}`
      );
    }
  }
}

const vdpState = vdp.getState?.();
if (!vdpState) {
  console.error('VDP state not available');
  process.exit(1);
}
if (!vdpState) {
  console.log('No VDP state available.');
  process.exit(1);
}

console.log('\n=== VRAM Analysis at Frame 420 ===');
console.log(`Total VRAM writes: ${vdpState.vramWrites}`);
console.log(`Display enabled: ${vdpState.displayEnabled}`);

// Check pattern data at various locations
const checkLocations = [
  0x0020, // Tile 1
  0x00c0, // Tile 6
  0x00e0, // Tile 7
  0x0100, // Tile 8
  0x0120, // Tile 9
];

console.log('\n=== Pattern Data (First byte vs other 3 bytes per row) ===');
for (const addr of checkLocations) {
  const tileNum = addr / 32;
  console.log(`\nTile ${tileNum} at 0x${addr.toString(16).padStart(4, '0')}:`);

  let hasData = false;
  let firstByteNonZero = 0;
  let otherBytesNonZero = 0;

  for (let row = 0; row < 8; row++) {
    const baseAddr = addr + row * 4;
    const bytes = [
      vdpState.vram[baseAddr] ?? 0,
      vdpState.vram[baseAddr + 1] ?? 0,
      vdpState.vram[baseAddr + 2] ?? 0,
      vdpState.vram[baseAddr + 3] ?? 0,
    ];

    if (bytes[0] !== 0) firstByteNonZero++;
    if (bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 0) otherBytesNonZero++;

    if (bytes.some(b => b !== 0)) hasData = true;

    console.log(`  Row ${row}: [${bytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}]`);
  }

  if (hasData) {
    console.log(`  Stats: First byte non-zero in ${firstByteNonZero}/8 rows`);
    console.log(`         Other bytes non-zero in ${otherBytesNonZero}/8 rows`);

    if (firstByteNonZero > 0 && otherBytesNonZero === 0) {
      console.log(`  ⚠️  PROBLEM: Only first byte has data!`);

      // Check what those first bytes look like in ROM
      const firstBytes = [];
      for (let row = 0; row < 8; row++) {
        firstBytes.push(vdpState.vram[addr + row * 4]);
      }

      // Search ROM for this sequence
      console.log(
        `  Searching ROM for sequence: ${firstBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`
      );
      for (let romAddr = 0; romAddr < Math.min(0x8000, rom.length - 8); romAddr++) {
        let match = true;
        for (let i = 0; i < 8; i++) {
          if ((rom[romAddr + i * 4] ?? 0) !== firstBytes[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          console.log(`  ✓ Found at ROM 0x${romAddr.toString(16).padStart(4, '0')} (stride 4)`);
        }

        // Also check consecutive bytes
        match = true;
        for (let i = 0; i < 8; i++) {
          if ((rom[romAddr + i] ?? 0) !== firstBytes[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          console.log(`  ✓ Found at ROM 0x${romAddr.toString(16).padStart(4, '0')} (consecutive)`);

          // Show what comes after in ROM
          console.log(`    Next 24 bytes in ROM:`);
          const nextBytes = [];
          for (let i = 8; i < 32; i++) {
            nextBytes.push((rom[romAddr + i] ?? 0).toString(16).padStart(2, '0'));
          }
          console.log(`    ${nextBytes.join(' ')}`);
        }
      }
    }
  }
}

console.log('\n=== Hypothesis ===');
console.log('The game appears to be using LDIR or similar to copy data to VRAM,');
console.log('but the source data has gaps (every 4th byte), OR the copy is');
console.log('incorrectly striding through memory with wrong increment.');
