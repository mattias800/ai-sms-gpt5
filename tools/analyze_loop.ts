import { readFileSync } from 'fs';
import { disassembleOne } from '../cpu/z80/disasm.js';

const rom = readFileSync('./sonic.sms');

console.log('=== Analyzing the initialization loop ===\n');

// Show raw bytes
console.log('Raw bytes from 0x02B0 to 0x02C5:');
for (let addr = 0x02B0; addr < 0x02C5; addr++) {
  process.stdout.write(rom[addr]!.toString(16).padStart(2, '0') + ' ');
}
console.log('\n');

// Manual disassembly
console.log('Manual analysis:');
console.log('0x02B0: 18 D2     - JR -46 (jumps to 0x0284)');
console.log('0x02B2: 06 0B     - LD B,0x0B');
console.log('0x02B4: 0E 8B     - LD C,0x8B'); 
console.log('0x02B6: 7E        - LD A,(HL)');
console.log('0x02B7: 12        - LD (DE),A');
console.log('0x02B8: 23        - INC HL');
console.log('0x02B9: 13        - INC DE');
console.log('0x02BA: D3 BF     - OUT (0xBF),A  ; VDP control port!');
console.log('0x02BC: 79        - LD A,C');
console.log('0x02BD: 90        - SUB B');
console.log('0x02BE: D3 BF     - OUT (0xBF),A  ; VDP control port!');
console.log('0x02C0: 10 F4     - DJNZ -12 (loops to 0x02B6)');

console.log('\n=== Critical Discovery ===');
console.log('This is NOT OTIR! This is a custom loop that:');
console.log('1. Copies 11 bytes from (HL)=0x0311 to (DE)=0xD218 in RAM');
console.log('2. For each byte, it also writes to VDP control port 0xBF');
console.log('3. First writes the data byte to 0xBF');
console.log('4. Then writes (0x8B - B) to 0xBF');
console.log('');
console.log('The VDP writes are setting up VRAM writes!');
console.log('- Writing data then (0x8B - B) sets up sequential VRAM addresses');
console.log('- 0x80 = VRAM write command bit');
console.log('- Starting at 0x80 (when B=11) up to 0x8A (when B=1)');

console.log('\n=== The 11 bytes being copied ===');
console.log('Source at 0x0311:');
for (let i = 0; i < 11; i++) {
  const byte = rom[0x0311 + i]!;
  process.stdout.write(byte.toString(16).padStart(2, '0') + ' ');
}
console.log();

console.log('\n=== What this means ===');
console.log('The code copies 11 bytes to:');
console.log('1. RAM at 0xD218-0xD222');
console.log('2. VRAM at addresses 0x0080-0x008A');
console.log('');
console.log('Then it jumps to 0x0284, expecting to find different code.');
console.log('Since 0x0284 is in the first 1KB, it must be expecting:');
console.log('- The mapper to have changed what\'s there');
console.log('- Or some other hardware effect');

console.log('\n=== Checking what the bytes mean ===');
const bytes: number[] = [];
for (let i = 0; i < 11; i++) {
  bytes.push(rom[0x0311 + i]!);
}
console.log('Bytes as potential Z80 code:');
const readFn = (addr: number): number => bytes[addr] ?? 0;
let pc = 0;
while (pc < 11) {
  const dis = disassembleOne(readFn, pc);
  const opBytes = [];
  for (let i = 0; i < dis.length && pc + i < 11; i++) {
    opBytes.push(bytes[pc + i]!.toString(16).padStart(2, '0'));
  }
  console.log(`  ${dis.text.padEnd(20)} ; ${opBytes.join(' ')}`);
  pc += dis.length;
  if (pc >= 11) break;
}
