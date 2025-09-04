import { readFileSync } from 'fs';
import { disassembleOne } from '../src/cpu/z80/disasm.js';

const rom = readFileSync('./sonic.sms');

console.log('=== Sonic 1 SMS Initialization Analysis ===\n');

// Show the code from 0x0280 to 0x02B5
console.log('ROM bytes from 0x0280 to 0x02B5:');
for (let addr = 0x0280; addr <= 0x02b5; addr += 16) {
  process.stdout.write(`0x${addr.toString(16).padStart(4, '0')}: `);
  for (let i = 0; i < 16 && addr + i <= 0x02b5; i++) {
    process.stdout.write((rom[addr + i] ?? 0)!.toString(16).padStart(2, '0') + ' ');
  }
  console.log();
}

console.log('\nDisassembly from 0x028B (where we jump to):');
const readFn = (addr: number): number => rom[addr] ?? 0 ?? 0;
let pc = 0x028b;
while (pc <= 0x02b2) {
  const dis = disassembleOne(readFn, pc);
  const bytes = [];
  for (let i = 0; i < dis.length; i++) {
    bytes.push((rom[pc + i] ?? 0)!.toString(16).padStart(2, '0'));
  }
  console.log(`0x${pc.toString(16).padStart(4, '0')}: ${dis.text.padEnd(20)} ; ${bytes.join(' ')}`);
  pc += dis.length;
}

console.log('\n=== Analysis ===');
console.log('The sequence is:');
console.log('1. LD A,0x80 / LD (0xFFFC),A - Write 0x80 to bank register 0');
console.log('2. LD A,0x00 / LD (0xFFFD),A - Write 0x00 to bank register 1');
console.log('3. LD A,0x01 / LD (0xFFFE),A - Write 0x01 to bank register 2');
console.log('4. LD A,0x02 / LD (0xFFFF),A - Write 0x02 to bank register 3');
console.log('5. LD HL,0xC000 / LD DE,0xC001 / LD BC,0x1FEF');
console.log('6. LD (HL),L - Store 0x00 at 0xC000');
console.log('7. LDIR - Clear RAM from 0xC001 to 0xDFEF');
console.log('8. LD SP,HL - Set stack pointer');
console.log('9. LD DE,0x0311 - Load DE with 0x0311');
console.log('10. JR -46 - Jump back to 0x0284\n');

console.log('The jump target 0x0284 contains:');
const target = 0x0284;
process.stdout.write(`0x${target.toString(16).padStart(4, '0')}: `);
for (let i = 0; i < 8; i++) {
  process.stdout.write((rom[target + i] ?? 0)!.toString(16).padStart(2, '0') + ' ');
}
console.log();

// Check what's special about the bytes
const byte1 = (rom[0x0284] ?? 0)!;
const byte2 = (rom[0x0285] ?? 0)!;
console.log(`\nFirst bytes at 0x0284: 0x${byte1.toString(16)} 0x${byte2.toString(16)}`);
console.log('This looks like data, not code.');

// Check if there's a pattern with bank switching
console.log('\n=== Bank Switching Theory ===');
console.log('Writing 0x80 to 0xFFFC with 16 banks:');
console.log('- Standard interpretation: 0x80 % 16 = 0 -> Still bank 0');
console.log('- If bit 7 has special meaning: Could disable ROM or enable RAM');

// Let's check what other addresses might be relevant
console.log('\n=== Checking for code at other locations ===');

// Check 0x0311 (the value loaded into DE before the jump)
console.log('\nAt 0x0311 (loaded into DE):');
const de_target = 0x0311;
process.stdout.write(`0x${de_target.toString(16).padStart(4, '0')}: `);
for (let i = 0; i < 16; i++) {
  process.stdout.write((rom[de_target + i] ?? 0)!.toString(16).padStart(2, '0') + ' ');
}
console.log();

// Disassemble from 0x0311
console.log('\nDisassembly from 0x0311:');
pc = 0x0311;
for (let i = 0; i < 5; i++) {
  const dis = disassembleOne(readFn, pc);
  const bytes = [];
  for (let j = 0; j < dis.length; j++) {
    bytes.push((rom[pc + j] ?? 0)!.toString(16).padStart(2, '0'));
  }
  console.log(`0x${pc.toString(16).padStart(4, '0')}: ${dis.text.padEnd(20)} ; ${bytes.join(' ')}`);
  pc += dis.length;
}

// Theory: Maybe the game copies code from 0x0311 to RAM?
console.log('\n=== Theory: Code copying ===');
console.log('DE = 0x0311 might be source address for code to copy');
console.log('But LDIR has already completed, so it would need another mechanism');

// Check if there's self-modifying code
console.log('\n=== Checking for self-modifying code pattern ===');
console.log('The LDIR clears 0xC001-0xDFEF with zeros');
console.log('The jump to 0x0284 expects to find code there');
console.log('This suggests either:');
console.log('1. The mapper should map different ROM to 0x0284 after 0x80 write');
console.log("2. The game expects to copy code there (but we don't see that)");
console.log("3. There's a special hardware behavior we're missing");
