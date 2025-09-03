import { readFileSync } from 'fs';
import { disassembleOne } from '../cpu/z80/disasm.js';
const rom = readFileSync('./sonic.sms');
const readFn = (addr) => rom[addr] ?? 0;
console.log('=== Full initialization sequence analysis ===\n');
// Disassemble the full sequence from 0x028B
console.log('Complete disassembly from 0x028B:');
let pc = 0x028B;
const endAddr = 0x02C0;
while (pc < endAddr) {
    const dis = disassembleOne(readFn, pc);
    const bytes = [];
    for (let i = 0; i < dis.length; i++) {
        bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
    }
    console.log(`0x${pc.toString(16).padStart(4, '0')}: ${dis.text.padEnd(20)} ; ${bytes.join(' ')}`);
    pc += dis.length;
}
console.log('\n=== Key observation ===');
console.log('After LDIR at 0x02A9, the code continues:');
console.log('0x02AB: LD SP,HL - Set stack pointer to end of cleared RAM');
console.log('0x02AC: LD HL,0311 - Source address for copy');
console.log('0x02AF: LD DE,D218 - Destination in RAM!');
console.log('0x02B2: LD B,0B - Counter = 11');
console.log('0x02B4: LD C,8B - This is C, not visible in prev listing');
console.log('');
console.log('This looks like setup for another copy operation!');
// Check what follows
console.log('\nWhat comes after 0x02B4?');
pc = 0x02B4;
for (let i = 0; i < 10; i++) {
    const dis = disassembleOne(readFn, pc);
    const bytes = [];
    for (let j = 0; j < dis.length; j++) {
        bytes.push(rom[pc + j].toString(16).padStart(2, '0'));
    }
    console.log(`0x${pc.toString(16).padStart(4, '0')}: ${dis.text.padEnd(20)} ; ${bytes.join(' ')}`);
    pc += dis.length;
    if (pc > 0x02C5)
        break;
}
console.log('\n=== OTIR Instruction ===');
console.log('0x02B6: OTIR - Output (HL) to port (C), increment HL, decrement B, repeat until B=0');
console.log('This outputs 11 bytes from 0x0311 to I/O port 0x8B!');
console.log('');
console.log('What are the 11 bytes at 0x0311?');
process.stdout.write('Data: ');
for (let i = 0; i < 11; i++) {
    process.stdout.write(rom[0x0311 + i].toString(16).padStart(2, '0') + ' ');
}
console.log();
console.log('\n=== Critical Discovery ===');
console.log('Port 0x8B is not a standard SMS I/O port!');
console.log('This might be:');
console.log('1. A special mapper control port');
console.log('2. Part of a copy protection scheme');
console.log('3. A way to upload code to special hardware');
console.log('');
console.log('The bytes being written: 26 a2 ff ff ff ff ff 00 00 00 ff');
console.log('This could be code or configuration data.');
// Let's see what's at the jump target after this
console.log('\n=== After OTIR ===');
console.log('After OTIR, the JR -46 jumps back to 0x0284');
console.log('Perhaps the OTIR to port 0x8B changes what\'s mapped there?');
//# sourceMappingURL=check_full_init.js.map