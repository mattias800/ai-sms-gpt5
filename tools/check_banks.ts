import { readFileSync } from 'fs';

const rom = readFileSync('./sonic.sms');

console.log('Checking what\'s at offset 0x284 in each 16KB bank:\n');

for (let bank = 0; bank < 16; bank++) {
  const base = bank * 0x4000;
  const addr = base + 0x284;
  
  if (addr < rom.length) {
    const bytes: number[] = [];
    for (let i = 0; i < 32; i++) {
      if (addr + i < rom.length) {
        bytes.push(rom[addr + i]!);
      }
    }
    
    console.log(`Bank ${bank.toString().padStart(2)} (0x${bank.toString(16).padStart(2, '0')}), offset 0x${addr.toString(16).padStart(5, '0')}:`);
    
    // Show hex
    process.stdout.write('  ');
    for (let i = 0; i < Math.min(16, bytes.length); i++) {
      process.stdout.write(bytes[i]!.toString(16).padStart(2, '0') + ' ');
    }
    console.log();
    
    // Check if it looks like code or data
    const firstByte = bytes[0];
    if (firstByte === 0x3d) {
      console.log('  -> Looks like data (starts with 0x3D)\n');
    } else if (firstByte === 0xc3) {
      const target = (bytes[2]! << 8) | bytes[1]!;
      console.log(`  -> JP ${target.toString(16).padStart(4, '0')}\n`);
    } else if (firstByte === 0x18) {
      const offset = (bytes[1]! << 24) >> 24; // sign extend
      console.log(`  -> JR ${offset}\n`);
    } else {
      console.log(`  -> First byte: 0x${firstByte?.toString(16).padStart(2, '0')}\n`);
    }
  }
}

// Also check what writing 0x80 to 0xFFFC should do
console.log('\n=== Bank mapping analysis ===');
console.log('Game writes 0x80 to 0xFFFC');
console.log('0x80 = binary 10000000');
console.log('0x80 % 16 banks = bank 0');
console.log('\nBut bank 0 at offset 0x284 has the same data bytes!');
console.log('This suggests the game expects different behavior...');

// Check if there's any pattern in bank 8 (0x08) 
console.log('\n=== Checking if lower nibble is used ===');
console.log('What if only lower 4 bits matter? 0x80 & 0x0F = 0x00 -> still bank 0');
console.log('What if bit 3 is special? 0x80 & 0x07 = 0x00 -> still bank 0');

// Check header for hints
console.log('\n=== ROM Header ===');
const headerStart = 0x7FF0;
const header = rom.subarray(headerStart, headerStart + 16);
console.log('Header at 0x7FF0:', Array.from(header).map(b => String.fromCharCode(b)).join(''));
console.log('Size byte at 0x7FFF:', '0x' + rom[0x7FFF]?.toString(16).padStart(2, '0'));

// Special check - what if first 1KB isn't fixed?
console.log('\n=== Theory: First 1KB might not be fixed ===');
console.log('Address 0x284 is in first 1KB (< 0x400)');
console.log('Standard SMS: first 1KB is always from bank 0');
console.log('But what if Sonic expects full slot 0 switching?');
