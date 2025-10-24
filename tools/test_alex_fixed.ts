import * as fs from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

console.log('Testing Alex Kidd with fixed LDIR...\n');

// Load the ROM
const romPath = 'test-roms/alexkidd.sms';
if (!fs.existsSync(romPath)) {
  console.error('ROM not found at', romPath);
  process.exit(1);
}

const rom = fs.readFileSync(romPath);
const cart: Cartridge = { rom: new Uint8Array(rom) };

// Create machine
const machine = createMachine({
  cart,
  fastBlocks: false, // Don't use fast blocks for now
});

const cpu = machine.getCPU();
const vdp = machine.getVDP();
const bus = machine.getBus();

// Run for a number of cycles to see if it initializes properly
const CYCLES_PER_FRAME = 59736; // NTSC SMS cycles per frame
const FRAMES_TO_RUN = 60; // 1 second

console.log('Running emulation for 1 second (60 frames)...\n');

let totalCycles = 0;
let lastPC = -1;
let stuckCounter = 0;

for (let frame = 0; frame < FRAMES_TO_RUN; frame++) {
  machine.runCycles(CYCLES_PER_FRAME);
  totalCycles += CYCLES_PER_FRAME;

  const state = cpu.getState();

  // Check if PC is stuck
  if (state.pc === lastPC) {
    stuckCounter++;
    if (stuckCounter > 10) {
      console.log(`⚠️ CPU appears stuck at PC=0x${state.pc.toString(16).padStart(4, '0')} for ${stuckCounter} frames`);
      if (stuckCounter > 20) break;
    }
  } else {
    if (stuckCounter > 0) {
      console.log(
        `✅ CPU resumed after being at PC=0x${lastPC.toString(16).padStart(4, '0')} for ${stuckCounter} frames`
      );
    }
    stuckCounter = 0;
    lastPC = state.pc;
  }

  // Every 10 frames, report progress
  if (frame % 10 === 0) {
    const vram0 = bus.read8(0x4000); // Read first VRAM byte through bus (if accessible)

    // Check some key RAM locations
    const ram0xC000 = bus.read8(0xc000);
    const ram0xC001 = bus.read8(0xc001);
    const ram0xDFFF = bus.read8(0xdfff);

    console.log(`Frame ${frame}:`);
    console.log(`  PC=0x${state.pc.toString(16).padStart(4, '0')}, SP=0x${state.sp.toString(16).padStart(4, '0')}`);
    console.log(
      `  RAM[C000]=${ram0xC000.toString(16).padStart(2, '0')}, RAM[C001]=${ram0xC001.toString(16).padStart(2, '0')}, RAM[DFFF]=${ram0xDFFF.toString(16).padStart(2, '0')}`
    );

    // Check VDP status
    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }
    const nameTableAddr = vdpState.nameTableAddr;
    console.log(`  VDP: Mode=${vdpState.mode}, NameTable=0x${nameTableAddr.toString(16)}`);

    // Sample some VRAM to see if patterns are loaded
    const vram = vdpState.vram;
    let nonZeroCount = 0;
    for (let i = 0; i < 0x1000; i++) {
      if (vram[i] !== 0) nonZeroCount++;
    }
    console.log(`  VRAM: ${nonZeroCount}/4096 non-zero bytes in first 4KB`);
  }
}

console.log(`\n=== Final Status ===`);
const finalState = cpu.getState();
console.log(`PC=0x${finalState.pc.toString(16).padStart(4, '0')}`);
console.log(`Total cycles executed: ${totalCycles}`);

// Check VRAM for graphics data
const vdpState = vdp.getState?.();
if (!vdpState) {
  console.error('VDP state not available');
  process.exit(1);
}
const vram = vdpState.vram;
let nonZeroBytes = 0;
let patternBytes = 0;

// Check pattern area (usually 0x0000-0x3FFF)
for (let i = 0; i < 0x4000; i++) {
  if (vram[i] !== 0) {
    nonZeroBytes++;
    if (i < 0x2000) patternBytes++; // First 8KB is typically tile patterns
  }
}

console.log(`\nVRAM Analysis:`);
console.log(`  Total non-zero bytes: ${nonZeroBytes}/16384 (${((nonZeroBytes / 16384) * 100).toFixed(1)}%)`);
console.log(`  Pattern area non-zero: ${patternBytes}/8192 (${((patternBytes / 8192) * 100).toFixed(1)}%)`);

if (nonZeroBytes > 1000) {
  console.log('\n✅ Graphics data appears to be loaded into VRAM!');
} else {
  console.log('\n❌ VRAM is mostly empty - game may not have initialized properly');
}

// Check if halted
if (finalState.halted) {
  console.log('\n⚠️ CPU is halted');
}

console.log('\n=== Test Complete ===');
