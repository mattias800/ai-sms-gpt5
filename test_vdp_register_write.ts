#!/usr/bin/env tsx

import { createVDP } from './src/vdp/vdp.js';

// Test VDP register write
const vdp = createVDP();

console.log('Testing VDP register write...');

// Check initial register 1 value
console.log(`Initial register 1: 0x${vdp.getRegister(1)?.toString(16)}`);

// Write to register 1 using the latch system
console.log('Writing to register 1...');
vdp.writePort(0xBF, 0x20); // Value (0x20) in low byte
console.log(`After first write, register 1: 0x${vdp.getRegister(1)?.toString(16)}`);

vdp.writePort(0xBF, 0x81); // Code 0x02 (register write) + register index 0x01
console.log(`After second write, register 1: 0x${vdp.getRegister(1)?.toString(16)}`);

// Test with different values
console.log('Testing with different values...');
vdp.writePort(0xBF, 0x00); // Value (0x00) in low byte
vdp.writePort(0xBF, 0x81); // Code 0x02 (register write) + register index 0x01
console.log(`After writing 0x00, register 1: 0x${vdp.getRegister(1)?.toString(16)}`);

vdp.writePort(0xBF, 0x20); // Value (0x20) in low byte
vdp.writePort(0xBF, 0x81); // Code 0x02 (register write) + register index 0x01
console.log(`After writing 0x20, register 1: 0x${vdp.getRegister(1)?.toString(16)}`);

console.log('VDP register write test completed');
