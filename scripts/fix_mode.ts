#!/usr/bin/env node

import { readFileSync } from 'fs';
import { createMachine, type IMachine } from '../src/machine/machine.js';
import { type Cartridge } from '../src/bus/bus.js';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart: Cartridge = { rom };
const m: IMachine = createMachine({ cart, fastBlocks: false });

console.log('=== Checking VDP Mode Setup ===\n');

// Run one frame to see initial setup
const cyclesPerFrame: number = 59736;
m.runCycles(cyclesPerFrame);

const vdp = m.getVDP();
const vdpState = vdp.getState ? vdp.getState?.() : undefined;

if (vdpState) {
  console.log('Initial VDP registers after 1 frame:');
  console.log(
    `R0: 0x${(vdpState.regs[0] ?? 0).toString(16)} (binary: ${(vdpState.regs[0] ?? 0).toString(2).padStart(8, '0')})`
  );
  console.log(
    `R1: 0x${(vdpState.regs[1] ?? 0).toString(16)} (binary: ${(vdpState.regs[1] ?? 0).toString(2).padStart(8, '0')})`
  );

  // Extract mode bits
  const r0 = vdpState.regs[0] ?? 0;
  const r1 = vdpState.regs[1] ?? 0;
  const m1 = r1 & 0x10 ? 1 : 0;
  const m2 = r1 & 0x08 ? 1 : 0;
  const m3 = r0 & 0x02 ? 1 : 0;
  const m4 = r0 & 0x04 ? 1 : 0;

  console.log(`\nMode bits: M1=${m1} M2=${m2} M3=${m3} M4=${m4}`);

  if (m4 && !m3 && !m2 && !m1) {
    console.log('✅ Correct SMS Mode 4 setup');
  } else {
    console.log('❌ Wrong mode! For SMS Mode 4 we need: M1=0 M2=0 M3=0 M4=1');
    console.log('\nTo fix R0 for Mode 4:');
    const fixedR0 = (r0 & ~0x02) | 0x04; // Clear M3 (bit 1), set M4 (bit 2)
    console.log(`  Current R0: 0x${r0.toString(16)} = ${r0.toString(2).padStart(8, '0')}`);
    console.log(`  Fixed R0:   0x${fixedR0.toString(16)} = ${fixedR0.toString(2).padStart(8, '0')}`);
  }

  // Run more frames and check if mode changes
  console.log('\n=== Running 60 more frames ===');
  for (let i = 0; i < 60; i++) {
    m.runCycles(cyclesPerFrame);
  }

  const vdpState2 = vdp.getState ? vdp.getState?.() : undefined;
  if (vdpState2) {
    console.log('\nAfter 61 frames:');
    console.log(`R0: 0x${(vdpState2.regs?.[0] ?? 0).toString(16)}`);
    console.log(`R1: 0x${(vdpState2.regs?.[1] ?? 0).toString(16)}`);

    const r0_2 = vdpState2.regs[0];
    const r1_2 = vdpState2.regs[1];
    const m3_2 = r0_2 & 0x02 ? 1 : 0;
    const m4_2 = r0_2 & 0x04 ? 1 : 0;

    console.log(`Mode bits: M3=${m3_2} M4=${m4_2}`);
  }
}
