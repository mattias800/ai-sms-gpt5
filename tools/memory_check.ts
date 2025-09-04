import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Memory mapping investigation ===\n');

// Check ROM directly
console.log('ROM bytes at 0x6C-0x72:');
for (let i = 0x6c; i <= 0x72; i++) {
  console.log(`ROM[0x${i.toString(16).padStart(4, '0')}] = 0x${rom[i]?.toString(16).padStart(2, '0')}`);
}

// Create machine and check bus reads
const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });
const cpu = m.getCPU();
const bus = m.getBus();

// Execute up to LD (HL),80
console.log('\n=== Executing initialization ===');
let steps = 0;
while (steps < 10) {
  const state = cpu.getState();
  const pc = state.pc;

  if (pc === 0x6c) {
    console.log('\nBefore LD (HL),80:');
    console.log(
      `PC=0x${pc.toString(16).padStart(4, '0')} HL=0x${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`
    );
  }

  if (pc === 0x6e) {
    console.log('\nAfter LD (HL),80:');
    const hl = (state.h << 8) | state.l;
    console.log(`PC=0x${pc.toString(16).padStart(4, '0')} HL=0x${hl.toString(16).padStart(4, '0')}`);
    console.log(`Memory[0xFFFC] = 0x${bus.read8(0xfffc).toString(16).padStart(2, '0')}`);

    // Now check what happens when we read from addresses
    console.log('\n-- Bus reads after mapper write --');
    for (let addr = 0x6c; addr <= 0x72; addr++) {
      const val = bus.read8(addr);
      console.log(`Bus.read8(0x${addr.toString(16).padStart(4, '0')}) = 0x${val.toString(16).padStart(2, '0')}`);
    }
    break;
  }

  try {
    cpu.stepOne();
  } catch (e) {
    console.log('Error:', e);
    break;
  }
  steps++;
}

// Check mapper behavior
console.log('\n=== Mapper state ===');
console.log(`Bank register 0xFFFC: 0x${bus.read8(0xfffc).toString(16).padStart(2, '0')}`);
console.log(`Bank register 0xFFFD: 0x${bus.read8(0xfffd).toString(16).padStart(2, '0')}`);
console.log(`Bank register 0xFFFE: 0x${bus.read8(0xfffe).toString(16).padStart(2, '0')}`);
console.log(`Bank register 0xFFFF: 0x${bus.read8(0xffff).toString(16).padStart(2, '0')}`);

// Read from slot 0 (0x0000-0x3FFF)
console.log('\n-- Reads from slot 0 (should show ROM page) --');
for (let addr = 0x0000; addr <= 0x0010; addr++) {
  const val = bus.read8(addr);
  console.log(`Bus.read8(0x${addr.toString(16).padStart(4, '0')}) = 0x${val.toString(16).padStart(2, '0')}`);
}
