import { createZ80 } from '../src/cpu/z80/z80.js';
import { IBus } from '../src/bus/bus.js';

// Create a simple test bus
const memory = new Uint8Array(0x10000);
const testBus: IBus = {
  read8: (addr: number) => memory[addr & 0xffff] ?? 0,
  write8: (addr: number, val: number) => {
    memory[addr & 0xffff] = val & 0xff;
  },
  readIO8: (_port: number) => 0xff,
  writeIO8: (_port: number, _val: number) => {},
};

// Create CPU with fast blocks enabled
const cpu = createZ80({
  bus: testBus,
  experimentalFastBlockOps: true,
});

console.log('Testing LDIR with BC=0 (fast blocks enabled)...\n');

// Set up test: LDIR at address 0x1000
memory[0x1000] = 0xed;
memory[0x1001] = 0xb0;
memory[0x1002] = 0x00; // NOP after LDIR

// Initialize CPU state
cpu.reset();
const state = cpu.getState();
state.pc = 0x1000;
state.h = 0x20;
state.l = 0x00; // HL = 0x2000
state.d = 0x30;
state.e = 0x00; // DE = 0x3000
state.b = 0x00;
state.c = 0x00; // BC = 0x0000 (the test case!)
cpu.setState(state);

console.log('Initial state:');
console.log(`  PC=${state.pc.toString(16).padStart(4, '0')}`);
console.log(`  HL=${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`);
console.log(`  DE=${((state.d << 8) | state.e).toString(16).padStart(4, '0')}`);
console.log(`  BC=${((state.b << 8) | state.c).toString(16).padStart(4, '0')}`);

// Execute LDIR
const result = cpu.stepOne();

const newState = cpu.getState();
console.log('\nAfter LDIR execution:');
console.log(`  PC=${newState.pc.toString(16).padStart(4, '0')} (should be 0x1002)`);
console.log(`  HL=${((newState.h << 8) | newState.l).toString(16).padStart(4, '0')} (should be 0x2000)`);
console.log(`  DE=${((newState.d << 8) | newState.e).toString(16).padStart(4, '0')} (should be 0x3000)`);
console.log(`  BC=${((newState.b << 8) | newState.c).toString(16).padStart(4, '0')} (should be 0x0000)`);
console.log(`  Cycles=${result.cycles} (should be 16)`);

// Test with BC=1 to ensure single iteration works
console.log('\n---\n');
console.log('Testing LDIR with BC=1 (fast blocks enabled)...\n');

state.pc = 0x1000;
state.h = 0x20;
state.l = 0x00;
state.d = 0x30;
state.e = 0x00;
state.b = 0x00;
state.c = 0x01; // BC = 1
memory[0x2000] = 0x42; // Source data
cpu.setState(state);

console.log('Initial state:');
console.log(`  PC=${state.pc.toString(16).padStart(4, '0')}`);
console.log(`  BC=${((state.b << 8) | state.c).toString(16).padStart(4, '0')}`);
console.log(`  Memory[0x2000]=${memory[0x2000]?.toString(16)}`);
console.log(`  Memory[0x3000]=${memory[0x3000]?.toString(16)}`);

const result2 = cpu.stepOne();
const newState2 = cpu.getState();

console.log('\nAfter LDIR execution:');
console.log(`  PC=${newState2.pc.toString(16).padStart(4, '0')} (should be 0x1002)`);
console.log(`  HL=${((newState2.h << 8) | newState2.l).toString(16).padStart(4, '0')} (should be 0x2001)`);
console.log(`  DE=${((newState2.d << 8) | newState2.e).toString(16).padStart(4, '0')} (should be 0x3001)`);
console.log(`  BC=${((newState2.b << 8) | newState2.c).toString(16).padStart(4, '0')} (should be 0x0000)`);
console.log(`  Memory[0x3000]=${memory[0x3000]?.toString(16)} (should be 0x42)`);
console.log(`  Cycles=${result2.cycles} (should be 16)`);

console.log('\nTest complete!');
