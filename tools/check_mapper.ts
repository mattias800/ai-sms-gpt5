import { readFileSync } from 'fs';

const rom = readFileSync('./sonic.sms');

console.log('=== Checking Sonic 1 Mapper Type ===\n');

// Check header
console.log('ROM Header at 0x7FF0:');
const header = rom.subarray(0x7FF0, 0x8000);
let headerStr = '';
for (let i = 0; i < 16; i++) {
  const c = header[i]!;
  headerStr += (c >= 32 && c < 127) ? String.fromCharCode(c) : '.';
}
console.log('Text:', headerStr);
console.log('Hex:', Array.from(header.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Check for Codemasters signature
console.log('\n=== Codemasters Mapper Check ===');
console.log('Codemasters games typically have:');
console.log('- No standard TMR SEGA header');
console.log('- Bank switching at 0x0000, 0x4000, 0x8000');
console.log('- Different bank register locations');

// Check first bytes
console.log('\nFirst 16 bytes of ROM:');
const first = rom.subarray(0, 16);
console.log('Hex:', Array.from(first).map(b => b.toString(16).padStart(2, '0')).join(' '));

// Standard SMS starts with F3 (DI) or similar
if (rom[0] === 0xF3) {
  console.log('Starts with DI (0xF3) - standard SMS ROM');
} else {
  console.log(`Starts with 0x${rom[0]?.toString(16).padStart(2, '0')} - might be non-standard`);
}

// Check size
console.log('\n=== ROM Size ===');
console.log(`ROM size: ${rom.length} bytes (${rom.length / 1024}KB)`);
console.log(`Banks: ${rom.length / 0x4000} x 16KB`);

// Check what writing 0x80 might mean
console.log('\n=== Bank Register 0xFFFC Analysis ===');
console.log('Standard Sega mapper:');
console.log('- Bits 0-5 or 0-6: Bank number');
console.log('- Bit 3 sometimes: RAM enable');
console.log('- Bit 7: Usually unused');
console.log('');
console.log('Writing 0x80 (binary 10000000):');
console.log('- All bank select bits are 0 -> Bank 0');
console.log('- Bit 7 is set -> Special meaning?');

// Look for any special patterns
console.log('\n=== Checking for Special Patterns ===');

// Check if there's code at 0x4000 that might be bank 1
console.log('\nAt 0x4000 + 0x284 = 0x4284:');
const addr4284 = 0x4284;
process.stdout.write('Bytes: ');
for (let i = 0; i < 8; i++) {
  process.stdout.write(rom[addr4284 + i]!.toString(16).padStart(2, '0') + ' ');
}
console.log();

// Check at 0x8000 + 0x284
console.log('\nAt 0x8000 + 0x284 = 0x8284:');
const addr8284 = 0x8284;
process.stdout.write('Bytes: ');
for (let i = 0; i < 8; i++) {
  process.stdout.write(rom[addr8284 + i]!.toString(16).padStart(2, '0') + ' ');
}
console.log();

console.log('\n=== Theory ===');
console.log('Sonic 1 SMS appears to use the standard Sega mapper.');
console.log('The 0x80 write to 0xFFFC is unusual and might:');
console.log('1. Be a bug in this ROM dump');
console.log('2. Expect non-standard hardware behavior');
console.log('3. Be part of copy protection that fails on emulators');
console.log('');
console.log('The fact that it jumps to 0x0284 expecting code but finds data');
console.log('suggests the mapper implementation needs special handling for this game.');
