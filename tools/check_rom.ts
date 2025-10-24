import { readFileSync } from 'fs';

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));

console.log(`ROM size: ${rom.length} bytes (${rom.length / 1024}KB)`);

// Check header at 0x7FF0
console.log('\n=== SMS Header (0x7FF0) ===');
for (let i = 0x7ff0; i < 0x8000 && i < rom.length; i += 16) {
  const bytes = [];
  const chars = [];
  for (let j = 0; j < 16 && i + j < rom.length; j++) {
    const b = rom[i + j] ?? 0;
    bytes.push(b.toString(16).padStart(2, '0'));
    chars.push(b >= 32 && b < 127 ? String.fromCharCode(b) : '.');
  }
  console.log(`0x${i.toString(16).padStart(4, '0')}: ${bytes.join(' ')}  ${chars.join('')}`);
}

// Look for potential tile data (areas with patterns)
console.log('\n=== Looking for tile patterns ===');

// Check different banks
for (let bank = 0; bank < 16; bank++) {
  const bankStart = bank * 0x4000;
  if (bankStart >= rom.length) break;

  // Check for non-zero, non-FF patterns
  let hasData = false;
  let nonZeroCount = 0;
  let nonFFCount = 0;

  for (let i = 0; i < 256 && bankStart + i < rom.length; i++) {
    const val = rom[bankStart + i] ?? 0;
    if (val !== 0) nonZeroCount++;
    if (val !== 0xff) nonFFCount++;
    if (val !== 0 && val !== 0xff) hasData = true;
  }

  if (hasData && nonZeroCount > 32 && nonFFCount > 32) {
    console.log(`\nBank ${bank} (0x${bankStart.toString(16)}) has potential data:`);

    // Show first 64 bytes
    for (let i = 0; i < 64 && bankStart + i < rom.length; i += 8) {
      const bytes = [];
      for (let j = 0; j < 8 && bankStart + i + j < rom.length; j++) {
        bytes.push((rom[bankStart + i + j] ?? 0).toString(16).padStart(2, '0'));
      }
      console.log(`  0x${(bankStart + i).toString(16).padStart(5, '0')}: ${bytes.join(' ')}`);
    }
  }
}

// Look for specific Alex Kidd patterns (usually at 0xC000+)
console.log('\n=== Checking common tile locations ===');
const commonOffsets = [0xc000, 0x10000, 0x14000, 0x18000, 0x1c000, 0x20000];

for (const offset of commonOffsets) {
  if (offset >= rom.length) continue;

  let hasPattern = false;
  for (let i = 0; i < 32; i++) {
    if ((rom[offset + i] ?? 0) !== 0 && (rom[offset + i] ?? 0) !== 0xff) {
      hasPattern = true;
      break;
    }
  }

  if (hasPattern) {
    console.log(`\nData at 0x${offset.toString(16)}:`);
    for (let i = 0; i < 32; i += 8) {
      const bytes = [];
      for (let j = 0; j < 8 && offset + i + j < rom.length; j++) {
        bytes.push((rom[offset + i + j] ?? 0).toString(16).padStart(2, '0'));
      }
      console.log(`  ${bytes.join(' ')}`);
    }
  }
}
