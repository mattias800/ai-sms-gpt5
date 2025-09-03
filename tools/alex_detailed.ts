import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import type { Cartridge } from '../bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Detailed CPU execution trace ===\n');

// Run machine step by step with detailed logging
const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const bus = m.getBus();

// Run step-by-step up to address 0x70
let steps = 0;
const maxSteps = 100;
let lastPC = 0;

while (steps < maxSteps) {
  const state = cpu.getState();
  const pc = state.pc;
  
  // Log important instructions
  if (pc >= 0x69 && pc <= 0x80) {
    const opcode = bus.read8(pc);
    console.log(`Step ${steps}: PC=0x${pc.toString(16).padStart(4, '0')} opcode=0x${opcode.toString(16).padStart(2, '0')} HL=0x${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`);
    
    if (pc === 0x6F) {
      console.log(`  -> About to execute LD (HL),00`);
      console.log(`  -> HL points to: 0x${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`);
    }
  }
  
  lastPC = pc;
  
  try {
    const result = cpu.stepOne();
    if (result.cycles === 0) {
      console.log('WARNING: Zero cycles returned!');
      break;
    }
  } catch (e) {
    console.log(`\nError at PC=0x${pc.toString(16).padStart(4, '0')}:`);
    console.log(e);
    break;
  }
  
  // Check if we jumped unexpectedly
  const newState = cpu.getState();
  if (newState.pc === 0x38 && lastPC !== 0x37) {
    console.log(`\n!! Unexpected jump to 0x0038 from PC=0x${lastPC.toString(16).padStart(4, '0')}`);
    break;
  }
  
  steps++;
}

console.log(`\nStopped after ${steps} steps`);
const finalState = cpu.getState();
console.log(`Final PC=0x${finalState.pc.toString(16).padStart(4, '0')}`);
