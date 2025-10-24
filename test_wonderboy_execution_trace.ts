#!/usr/bin/env tsx

import { createZ80 } from './src/cpu/z80/z80.js';
import { SmsBus } from './src/bus/bus.js';
import { createVDP } from './src/vdp/vdp.js';
import { createPSG } from './src/psg/sn76489.js';
import { initializeSMS, enableSMSInterrupts } from './src/machine/sms_init.js';
import { readFileSync } from 'node:fs';

// Trace Wonderboy execution to see how far it goes
const romData = readFileSync('wonderboy5.sms');
const cart: Cartridge = { rom: new Uint8Array(romData) };

const vdp = createVDP();
const psg = createPSG();
const bus = new SmsBus(cart, vdp, psg, null, null, { 
  allowCartRam: true, 
  bios: null // No BIOS - use manual initialization
});

const cpu = createZ80({
  bus,
  experimentalFastBlockOps: true,
  onCycle: (cycles: number) => {
    vdp.tickCycles(cycles);
    psg.tickCycles(cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
  },
});

console.log('Tracing Wonderboy execution...');

// Initialize SMS system manually (replaces BIOS)
initializeSMS({ cpu, vdp, psg, bus });

// Enable interrupts
enableSMSInterrupts(cpu);

// Track PC progression
const pcHistory: number[] = [];
const pcCounts = new Map<number, number>();

let stepCount = 0;
let interruptCount = 0;
let lastPC = 0;
let stuckCount = 0;

console.log('Starting Wonderboy execution trace...');

while (stepCount < 10000) {
  const result = cpu.stepOne();
  stepCount++;
  
  const state = cpu.getState();
  const currentPC = state.pc;
  
  // Track PC progression
  pcHistory.push(currentPC);
  pcCounts.set(currentPC, (pcCounts.get(currentPC) || 0) + 1);
  
  if (result.irqAccepted) {
    interruptCount++;
    console.log(`Step ${stepCount}: PC=${currentPC.toString(16).padStart(4, '0')}, IRQ accepted (${interruptCount})`);
  }
  
  // Log significant PC changes
  if (currentPC !== lastPC) {
    if (currentPC > 0x0100 || currentPC < 0x00A0) {
      console.log(`Step ${stepCount}: PC=${currentPC.toString(16).padStart(4, '0')}, cycles=${result.cycles}, interrupts=${interruptCount}`);
    }
    stuckCount = 0;
  } else {
    stuckCount++;
  }
  
  lastPC = currentPC;
  
  // Check for progress
  if (currentPC > 0x0200) {
    console.log(`Wonderboy made significant progress! PC=${currentPC.toString(16).padStart(4, '0')}`);
    break;
  }
  
  // Check if stuck
  if (stuckCount > 1000) {
    console.log(`Stuck at PC ${currentPC.toString(16).padStart(4, '0')} for ${stuckCount} steps`);
    break;
  }
  
  // Log every 1000 steps
  if (stepCount % 1000 === 0) {
    console.log(`Step ${stepCount}: PC=${currentPC.toString(16).padStart(4, '0')}, cycles=${result.cycles}, interrupts=${interruptCount}, halted=${state.halted}`);
  }
}

// Analyze PC distribution
console.log('\nPC Distribution (most frequent addresses):');
const sortedPCs = Array.from(pcCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

for (const [pc, count] of sortedPCs) {
  console.log(`PC ${pc.toString(16).padStart(4, '0')}: ${count} times`);
}

// Show recent PC history
console.log('\nRecent PC history (last 20):');
const recentPCs = pcHistory.slice(-20);
for (let i = 0; i < recentPCs.length; i++) {
  const pc = recentPCs[i];
  console.log(`${i.toString().padStart(2, ' ')}: ${pc.toString(16).padStart(4, '0')}`);
}

console.log(`\nTotal steps: ${stepCount}`);
console.log(`Total interrupts: ${interruptCount}`);
console.log(`Final PC: ${cpu.getState().pc.toString(16).padStart(4, '0')}`);
console.log('Wonderboy execution trace completed');



