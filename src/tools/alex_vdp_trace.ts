import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import type { Cartridge } from '../bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Alex Kidd VDP Trace ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: true });

// Run for 1 second (60 frames)
const cyclesPerFrame = 59736;
console.log('Running 60 frames...\n');

for (let frame = 0; frame < 60; frame++) {
  m.runCycles(cyclesPerFrame);
}

// Check VDP state
const vdp = m.getVDP();
const cpu = m.getCPU();
const bus = m.getBus();
const vdpState = vdp.getState ? vdp.getState() : undefined;
const cpuState = cpu.getState();

if (vdpState) {
  console.log('VDP State after 60 frames:');
  console.log(`Display enabled: ${vdpState.displayEnabled}`);
  console.log(`VBlank IRQ enabled: ${vdpState.vblankIrqEnabled}`);
  console.log(`VRAM writes: ${vdpState.vramWrites}`);
  console.log(`CRAM writes: ${vdpState.cramWrites}`);
  console.log(`Non-zero VRAM writes: ${vdpState.nonZeroVramWrites}`);
  
  console.log('\nVDP Registers:');
  for (let i = 0; i < 11; i++) {
    const val = vdpState.regs[i] ?? 0;
    console.log(`  Reg ${i}: 0x${val.toString(16).padStart(2, '0')} (${val})`);
  }
  
  console.log('\nVDP Register meanings:');
  console.log(`  R0: Mode control 1`);
  console.log(`  R1: Mode control 2 - Display:${(vdpState.regs[1] & 0x40) ? 'ON' : 'OFF'}, VBlank IRQ:${(vdpState.regs[1] & 0x20) ? 'ON' : 'OFF'}`);
  console.log(`  R2: Name table base = 0x${((vdpState.regs[2] & 0x0E) << 10).toString(16)}`);
  console.log(`  R3: Color table base (unused in SMS mode)`);
  console.log(`  R4: Pattern table base = 0x${((vdpState.regs[4] & 0x07) << 11).toString(16)}`);
  console.log(`  R5: Sprite attribute table base = 0x${((vdpState.regs[5] & 0x7E) << 7).toString(16)}`);
  console.log(`  R6: Sprite pattern table base = 0x${((vdpState.regs[6] & 0x07) << 11).toString(16)}`);
  console.log(`  R7: Border color = ${vdpState.regs[7] & 0x0F}`);
  console.log(`  R8: Horizontal scroll = ${vdpState.regs[8]}`);
  console.log(`  R9: Vertical scroll = ${vdpState.regs[9]}`);
  console.log(`  R10: Line interrupt counter = ${vdpState.regs[10]}`);
  
  // Check first few non-zero bytes in VRAM
  console.log('\nFirst non-zero VRAM bytes:');
  let count = 0;
  for (let i = 0; i < vdpState.vram.length && count < 10; i++) {
    if (vdpState.vram[i] !== 0) {
      console.log(`  VRAM[0x${i.toString(16).padStart(4, '0')}] = 0x${vdpState.vram[i]!.toString(16).padStart(2, '0')}`);
      count++;
    }
  }
  if (count === 0) {
    console.log('  All VRAM is zero!');
  }
  
  // Check CRAM
  console.log('\nCRAM (palette) values:');
  for (let i = 0; i < 32; i++) {
    const val = vdpState.cram[i] ?? 0;
    if (val !== 0) {
      const r = ((val >> 4) & 3) * 85;
      const g = ((val >> 2) & 3) * 85; 
      const b = (val & 3) * 85;
      console.log(`  CRAM[${i}] = 0x${val.toString(16).padStart(2, '0')} RGB(${r},${g},${b})`);
    }
  }
}

console.log(`\nCPU PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`Interrupts enabled: ${cpuState.iff1}`);

// Run more frames to see if display gets enabled
console.log('\n=== Running 120 more frames ===');
for (let frame = 0; frame < 120; frame++) {
  m.runCycles(cyclesPerFrame);
  
  if (frame % 60 === 0) {
    const vdpSt = vdp.getState ? vdp.getState() : undefined;
    const cpuSt = cpu.getState();
    if (vdpSt) {
      console.log(`Frame ${60 + frame}: Display=${vdpSt.displayEnabled}, PC=0x${cpuSt.pc.toString(16).padStart(4, '0')}, VRAM writes=${vdpSt.vramWrites}`);
    }
  }
}
