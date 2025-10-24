import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

console.log('=== Testing Basic Memory Operations ===\n');

const rom = new Uint8Array(0x4000);

// Test program: write to RAM and read back
let addr = 0;
rom[addr++] = 0x3e;
rom[addr++] = 0xaa; // LD A,0xAA
rom[addr++] = 0x32;
rom[addr++] = 0x00;
rom[addr++] = 0xc0; // LD (0xC000),A
rom[addr++] = 0x3a;
rom[addr++] = 0x00;
rom[addr++] = 0xc0; // LD A,(0xC000)
rom[addr++] = 0x76; // HALT

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });
const cpu = m.getCPU();
const bus = m.getBus();

// Direct bus test
console.log('Direct bus test:');
bus.write8(0xc000, 0x55);
const readBack = bus.read8(0xc000);
console.log(`  Wrote 0x55 to 0xC000, read back: 0x${readBack.toString(16).padStart(2, '0')}`);

// Test simple memory copy
console.log('\nSimple memory test:');
bus.write8(0xc100, 0xaa);
bus.write8(0xc101, 0xbb);
bus.write8(0xc102, 0xcc);

console.log(`  Before copy: 0xC100=${bus.read8(0xc100).toString(16)}, 0xC200=${bus.read8(0xc200).toString(16)}`);

// Execute copy manually
const src = 0xc100;
const dst = 0xc200;
const val = bus.read8(src);
bus.write8(dst, val);

console.log(`  After copy: 0xC100=${bus.read8(0xc100).toString(16)}, 0xC200=${bus.read8(0xc200).toString(16)}`);

// Test CPU execution
console.log('\nCPU execution test:');
cpu.reset();
cpu.stepOne(); // LD A,0xAA
let state = cpu.getState();
console.log(`  After LD A,0xAA: A=0x${state.a.toString(16).padStart(2, '0')}`);

cpu.stepOne(); // LD (0xC000),A
const memVal = bus.read8(0xc000);
console.log(`  After LD (0xC000),A: mem[0xC000]=0x${memVal.toString(16).padStart(2, '0')}`);

cpu.stepOne(); // LD A,(0xC000)
state = cpu.getState();
console.log(`  After LD A,(0xC000): A=0x${state.a.toString(16).padStart(2, '0')}`);

// Now test LDIR with manual stepping
console.log('\n=== Testing LDIR with Manual Steps ===\n');

const rom2 = new Uint8Array(0x4000);

// Set up test data in RAM
addr = 0;
rom2[addr++] = 0x3e;
rom2[addr++] = 0x11; // LD A,0x11
rom2[addr++] = 0x32;
rom2[addr++] = 0x00;
rom2[addr++] = 0xc1; // LD (0xC100),A
rom2[addr++] = 0x3e;
rom2[addr++] = 0x22; // LD A,0x22
rom2[addr++] = 0x32;
rom2[addr++] = 0x01;
rom2[addr++] = 0xc1; // LD (0xC101),A
rom2[addr++] = 0x3e;
rom2[addr++] = 0x33; // LD A,0x33
rom2[addr++] = 0x32;
rom2[addr++] = 0x02;
rom2[addr++] = 0xc1; // LD (0xC102),A
// Now do LDIR
rom2[addr++] = 0x21;
rom2[addr++] = 0x00;
rom2[addr++] = 0xc1; // LD HL,0xC100
rom2[addr++] = 0x11;
rom2[addr++] = 0x00;
rom2[addr++] = 0xc2; // LD DE,0xC200
rom2[addr++] = 0x01;
rom2[addr++] = 0x03;
rom2[addr++] = 0x00; // LD BC,0x0003
rom2[addr++] = 0xed;
rom2[addr++] = 0xb0; // LDIR
rom2[addr++] = 0x76; // HALT

const cart2: Cartridge = { rom: rom2 };
const m2 = createMachine({ cart: cart2, fastBlocks: false });
const cpu2 = m2.getCPU();
const bus2 = m2.getBus();

// Execute setup
console.log('Setting up data in RAM...');
for (let i = 0; i < 6; i++) {
  cpu2.stepOne();
}

// Check setup
console.log(`  RAM[0xC100]=0x${bus2.read8(0xc100).toString(16)}`);
console.log(`  RAM[0xC101]=0x${bus2.read8(0xc101).toString(16)}`);
console.log(`  RAM[0xC102]=0x${bus2.read8(0xc102).toString(16)}`);

// Execute register setup for LDIR
cpu2.stepOne(); // LD HL
cpu2.stepOne(); // LD DE
cpu2.stepOne(); // LD BC

const stateBefore = cpu2.getState();
console.log(`\nBefore LDIR:`);
console.log(`  HL=0x${((stateBefore.h << 8) | stateBefore.l).toString(16).padStart(4, '0')}`);
console.log(`  DE=0x${((stateBefore.d << 8) | stateBefore.e).toString(16).padStart(4, '0')}`);
console.log(`  BC=0x${((stateBefore.b << 8) | stateBefore.c).toString(16).padStart(4, '0')}`);
console.log(`  PC=0x${stateBefore.pc.toString(16).padStart(4, '0')}`);

// Execute first LDIR iteration
console.log('\nExecuting LDIR (first iteration)...');
const result1 = cpu2.stepOne();
const state1 = cpu2.getState();

console.log(`After first iteration:`);
console.log(`  HL=0x${((state1.h << 8) | state1.l).toString(16).padStart(4, '0')}`);
console.log(`  DE=0x${((state1.d << 8) | state1.e).toString(16).padStart(4, '0')}`);
console.log(`  BC=0x${((state1.b << 8) | state1.c).toString(16).padStart(4, '0')}`);
console.log(`  PC=0x${state1.pc.toString(16).padStart(4, '0')}`);
console.log(`  Cycles=${result1.cycles}`);
console.log(`  RAM[0xC200]=0x${bus2.read8(0xc200).toString(16)}`);

if (state1.pc === stateBefore.pc) {
  console.log('✅ PC correctly stayed at LDIR for repeat');

  // Continue iterations
  console.log('\nContinuing LDIR iterations...');
  let iterCount = 1;
  while ((state1.b !== 0 || state1.c !== 0) && iterCount < 10) {
    const res = cpu2.stepOne();
    const st = cpu2.getState();
    iterCount++;
    console.log(
      `  Iteration ${iterCount}: BC=0x${((st.b << 8) | st.c).toString(16).padStart(4, '0')}, PC=0x${st.pc.toString(16).padStart(4, '0')}`
    );

    if (st.b === 0 && st.c === 0) {
      console.log('✅ BC reached zero');
      if (st.pc === stateBefore.pc + 2) {
        console.log('✅ PC advanced to next instruction');
      }
      break;
    }
  }

  // Check final memory
  console.log('\nFinal memory check:');
  console.log(`  RAM[0xC200]=0x${bus2.read8(0xc200).toString(16)}`);
  console.log(`  RAM[0xC201]=0x${bus2.read8(0xc201).toString(16)}`);
  console.log(`  RAM[0xC202]=0x${bus2.read8(0xc202).toString(16)}`);
} else {
  console.log('❌ PC did not stay at LDIR');
}

console.log('\n=== Test Complete ===');
