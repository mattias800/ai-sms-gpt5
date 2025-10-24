import { readFileSync } from 'fs';
import { createMachine, type IMachine } from '../src/machine/machine.js';
import { type Cartridge } from '../src/bus/bus.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart: Cartridge = { rom };
const m: IMachine = createMachine({ cart, fastBlocks: false });

// Run until display is on
const cyclesPerFrame: number = 59736;
for (let frame = 0; frame < 120; frame++) {
  m.runCycles(cyclesPerFrame);
  const vdp = m.getVDP();
  const vdpState = vdp.getState ? vdp.getState?.() : undefined;
  if (vdpState && vdpState.displayEnabled && vdpState.nonZeroVramWrites > 3000) {
    console.log(`Stopped at frame ${frame}`);
    break;
  }
}

const vdp = m.getVDP();
const vdpState = vdp.getState?.();
if (!vdpState) {
  console.error('Failed to get VDP state');
  process.exit(1);
}

console.log('\nVDP Registers:');
console.log(
  'R2 (Name table):',
  vdpState.regs[2]?.toString(16) ?? 'N/A',
  '-> Base:',
  (((vdpState.regs[2] ?? 0 ?? 0) & 0x0e) << 10).toString(16)
);
console.log(
  'R4 (Pattern):',
  vdpState.regs[4]?.toString(16) ?? 'N/A',
  '-> Bit 2:',
  ((vdpState.regs[4] ?? 0 ?? 0) & 0x04) !== 0
);

// Check VRAM at pattern bases
console.log('\nVRAM at 0x0000-0x0040:');
let hasData0 = false;
for (let i = 0; i < 0x40; i++) {
  if ((vdpState.vram[i] ?? 0) !== 0) {
    hasData0 = true;
    break;
  }
}
console.log(hasData0 ? 'Has tile data' : 'All zeros');

console.log('\nVRAM at 0x2000-0x2040:');
let hasData2000 = false;
for (let i = 0x2000; i < 0x2040; i++) {
  if ((vdpState.vram[i] ?? 0) !== 0) {
    hasData2000 = true;
    break;
  }
}
console.log(hasData2000 ? 'Has tile data' : 'All zeros');

// Check name table
const nameBase: number = ((vdpState.regs[2] ?? 0 ?? 0) & 0x0e) << 10;
console.log('\nName table at', nameBase.toString(16) + ':');
const uniqueTiles: Set<number> = new Set();
for (let i = 0; i < 32 * 24 * 2; i += 2) {
  const addr = (nameBase + i) & 0x3fff;
  const low = vdpState.vram[addr] ?? 0 ?? 0;
  const high = vdpState.vram[addr + 1] ?? 0 ?? 0;
  const tileIndex = ((high & 0x03) << 8) | low;
  if (tileIndex !== 0) uniqueTiles.add(tileIndex);
}
console.log(
  'Unique non-zero tiles:',
  Array.from(uniqueTiles).slice(0, 10).join(', '),
  uniqueTiles.size > 10 ? '...' : ''
);

// Check where tiles should be
const sampleTile = Array.from(uniqueTiles)[0];
if (sampleTile !== undefined) {
  console.log('\nSample tile', sampleTile, '(0x' + sampleTile.toString(16) + '):');
  const patternAddr0 = (sampleTile << 5) & 0x3fff;
  const patternAddr2000 = (0x2000 + (sampleTile << 5)) & 0x3fff;

  console.log(
    'At base 0x0000 (addr',
    patternAddr0.toString(16) + '):',
    (vdpState.vram[patternAddr0] ?? 0) !== 0 ? 'Has data' : 'Empty'
  );
  console.log(
    'At base 0x2000 (addr',
    patternAddr2000.toString(16) + '):',
    (vdpState.vram[patternAddr2000] ?? 0) !== 0 ? 'Has data' : 'Empty'
  );
}
