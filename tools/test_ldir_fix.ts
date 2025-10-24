import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

console.log('=== Testing LDIR Instruction ===\n');

// Test 1: Simple LDIR with BC=3
function testSimpleLDIR(): void {
  const rom = new Uint8Array(0x4000);

  // Set up test data at 0x1000
  rom[0x1000] = 0xaa;
  rom[0x1001] = 0xbb;
  rom[0x1002] = 0xcc;

  // Program: LDIR from 0x1000 to 0xC000, BC=3
  let addr = 0;
  rom[addr++] = 0x21;
  rom[addr++] = 0x00;
  rom[addr++] = 0x10; // LD HL,0x1000
  rom[addr++] = 0x11;
  rom[addr++] = 0x00;
  rom[addr++] = 0xc0; // LD DE,0xC000
  rom[addr++] = 0x01;
  rom[addr++] = 0x03;
  rom[addr++] = 0x00; // LD BC,0x0003
  rom[addr++] = 0xed;
  rom[addr++] = 0xb0; // LDIR
  rom[addr++] = 0x76; // HALT

  const cart: Cartridge = { rom };
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();
  const bus = m.getBus();

  // Execute setup
  cpu.stepOne(); // LD HL
  cpu.stepOne(); // LD DE
  cpu.stepOne(); // LD BC

  const stateBefore = cpu.getState();
  console.log(
    `Before LDIR: PC=0x${stateBefore.pc.toString(16).padStart(4, '0')}, BC=0x${((stateBefore.b << 8) | stateBefore.c).toString(16).padStart(4, '0')}`
  );

  // Execute LDIR (multiple iterations until BC=0)
  let totalCycles = 0;
  let iterations = 0;
  let currentState = cpu.getState();

  while (iterations < 10) {
    const result = cpu.stepOne();
    totalCycles += result.cycles;
    iterations++;

    currentState = cpu.getState();
    const bc = (currentState.b << 8) | currentState.c;
    console.log(
      `  Iteration ${iterations}: BC=0x${bc.toString(16).padStart(4, '0')}, PC=0x${currentState.pc.toString(16).padStart(4, '0')}, cycles=${result.cycles}`
    );

    if (bc === 0) {
      break;
    }
  }

  const stateAfter = currentState;
  const bcAfter = (stateAfter.b << 8) | stateAfter.c;
  const pcAfter = stateAfter.pc;

  console.log(
    `After LDIR complete: PC=0x${pcAfter.toString(16).padStart(4, '0')}, BC=0x${bcAfter.toString(16).padStart(4, '0')}, total cycles=${totalCycles}`
  );

  // Check memory
  const copied = [bus.read8(0xc000), bus.read8(0xc001), bus.read8(0xc002)];

  console.log(`Memory at 0xC000: ${copied.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);

  // Analyze results
  if (bcAfter === 0 && copied[0] === 0xaa && copied[1] === 0xbb && copied[2] === 0xcc) {
    console.log('✅ LDIR copied all data correctly');
  } else if (bcAfter === 2 && copied[0] === 0xaa) {
    console.log('❌ LDIR only executed once (BC should be 0, is ' + bcAfter + ')');
  } else {
    console.log('❌ LDIR failed completely');
  }

  // Check if PC advanced past the instruction
  if (pcAfter === 0x000b) {
    console.log('✅ PC advanced correctly to next instruction');
  } else if (pcAfter === 0x0009) {
    console.log('❌ PC still at LDIR instruction (would repeat)');
  } else {
    console.log(`❌ PC at unexpected location: 0x${pcAfter.toString(16).padStart(4, '0')}`);
  }
}

// Test 2: Test with fastBlocks enabled
function testFastLDIR(): void {
  console.log('\n--- Testing with fastBlocks=true ---');

  const rom = new Uint8Array(0x4000);

  // Set up test data
  for (let i = 0; i < 10; i++) {
    rom[0x1000 + i] = 0x10 + i;
  }

  // Program
  let addr = 0;
  rom[addr++] = 0x21;
  rom[addr++] = 0x00;
  rom[addr++] = 0x10; // LD HL,0x1000
  rom[addr++] = 0x11;
  rom[addr++] = 0x00;
  rom[addr++] = 0xc3; // LD DE,0xC300
  rom[addr++] = 0x01;
  rom[addr++] = 0x0a;
  rom[addr++] = 0x00; // LD BC,0x000A (10 bytes)
  rom[addr++] = 0xed;
  rom[addr++] = 0xb0; // LDIR
  rom[addr++] = 0x76; // HALT

  const cart: Cartridge = { rom };
  const m = createMachine({ cart, fastBlocks: true }); // Enable fast blocks
  const cpu = m.getCPU();
  const bus = m.getBus();

  // Execute setup
  cpu.stepOne(); // LD HL
  cpu.stepOne(); // LD DE
  cpu.stepOne(); // LD BC

  // Execute LDIR (multiple iterations until BC=0)
  let totalCycles = 0;
  let iterations = 0;
  let state = cpu.getState();

  while (iterations < 20) {
    const result = cpu.stepOne();
    totalCycles += result.cycles;
    iterations++;

    state = cpu.getState();
    const bc = (state.b << 8) | state.c;

    if (bc === 0) {
      break;
    }
  }

  const bcAfter = (state.b << 8) | state.c;

  console.log(
    `After LDIR: BC=0x${bcAfter.toString(16).padStart(4, '0')}, iterations=${iterations}, total cycles=${totalCycles}`
  );

  // Check if all 10 bytes were copied
  let allCopied = true;
  for (let i = 0; i < 10; i++) {
    const val = bus.read8(0xc300 + i);
    if (val !== 0x10 + i) {
      allCopied = false;
      console.log(
        `  ❌ Byte ${i} not copied correctly: expected 0x${(0x10 + i).toString(16)}, got 0x${val.toString(16)}`
      );
    }
  }

  if (allCopied && bcAfter === 0) {
    console.log('✅ Fast LDIR copied all data correctly');
    // Expected cycles: 9*21 + 16 = 205
    const expectedCycles = 9 * 21 + 16;
    if (totalCycles === expectedCycles) {
      console.log(`✅ Cycle count correct: ${totalCycles}`);
    } else {
      console.log(`❌ Cycle count wrong: ${totalCycles} (expected ${expectedCycles})`);
    }
  } else {
    console.log('❌ Fast LDIR failed');
  }
}

// Run tests
testSimpleLDIR();
testFastLDIR();

console.log('\n=== LDIR Test Complete ===');
