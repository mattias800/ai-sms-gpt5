import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from './build/machine/machine.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cyclesPerFrame = 59736;
let displayEnabledFrame = -1;
let lastGoodFrame = -1;

console.log('Running Alex Kidd for 600 frames (10 seconds)...\n');

for (let frame = 0; frame < 600; frame++) {
  m.runCycles(cyclesPerFrame);
  
  const vdp = m.getVDP();
  const vdpState = vdp.getState();
  const cpu = m.getCPU();
  const cpuState = cpu.getState();
  
  if (vdpState && vdpState.displayEnabled) {
    if (displayEnabledFrame === -1) {
      displayEnabledFrame = frame;
      console.log(`Frame ${frame}: Display enabled!`);
    }
    
    if (vdpState.nonZeroVramWrites > 10000) {
      lastGoodFrame = frame;
    }
  }
  
  if (frame % 60 === 0) {
    const nonZero = vdpState ? vdpState.nonZeroVramWrites : 0;
    const status = vdpState?.displayEnabled ? 'ON' : 'OFF';
    console.log(`Frame ${frame}: PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, Display=${status}, NonZeroWrites=${nonZero}`);
    
    // Check for specific game states
    if (cpuState.pc >= 0x8000 && cpuState.pc < 0xC000) {
      console.log('  -> Running from bank 2 (game code)');
    }
  }
}

console.log(`\nFinal statistics:`);
const vdpFinal = m.getVDP().getState();
const cpuFinal = m.getCPU().getState();

console.log(`Display enabled at frame: ${displayEnabledFrame}`);
console.log(`Last frame with >10000 writes: ${lastGoodFrame}`);
console.log(`Final PC: 0x${cpuFinal.pc.toString(16)}`);
console.log(`Total VRAM writes: ${vdpFinal.vramWrites}`);
console.log(`Non-zero VRAM writes: ${vdpFinal.nonZeroVramWrites}`);

// Check tile patterns
let tilesWithData = 0;
for (let tile = 0; tile < 256; tile++) {
  const addr = tile << 5;
  let hasData = false;
  for (let i = 0; i < 32; i++) {
    if (vdpFinal.vram[addr + i] !== 0) {
      hasData = true;
      break;
    }
  }
  if (hasData) tilesWithData++;
}
console.log(`Tiles with pattern data: ${tilesWithData}/256`);

// Save final state
const diag = {
  framesRun: 600,
  displayEnabledFrame,
  lastGoodFrame,
  finalPC: cpuFinal.pc.toString(16),
  vramWrites: vdpFinal.vramWrites,
  nonZeroVramWrites: vdpFinal.nonZeroVramWrites,
  tilesWithData,
  regs: vdpFinal.regs.slice(0, 11)
};

writeFileSync('alex_long_run.json', JSON.stringify(diag, null, 2));
console.log('\nWrote alex_long_run.json');
