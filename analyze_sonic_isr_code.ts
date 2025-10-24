import { promises as fs } from 'fs';

/**
 * Analyze Sonic's ISR code at 0x0073 to understand why audio isn't unmuted
 * We'll read the ROM bytes and attempt basic Z80 disassembly
 */

const analyzeISRCode = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);

  console.log('=== SONIC ISR HANDLER ANALYSIS ===\n');
  console.log('Expected ISR vector: 0x0038 (VBlank)');
  console.log('Sonic ISR handler: 0x0073\n');

  // Read bytes from ISR entry point
  const isrStart = 0x0073;
  const readLength = 256; // Read 256 bytes to see what ISR does

  console.log(`First 40 bytes from address 0x0073:\n`);
  console.log('Addr  | Hex bytes                              | ASCII');
  console.log('------|----------------------------------------|----------');

  for (let i = 0; i < 40; i++) {
    const addr = isrStart + i;
    const byte = rom[addr];
    const hex = byte.toString(16).padStart(2, '0').toUpperCase();
    const ascii = byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.';
    
    if (i % 16 === 0) {
      console.log(`0x${addr.toString(16).padStart(4, '0')} | `, '');
    }
  }

  // Try to disassemble some instructions
  console.log('\n\n=== ATTEMPTING Z80 DISASSEMBLY ===\n');
  
  let pc = isrStart;
  let instructionCount = 0;
  const maxInstructions = 20;

  while (instructionCount < maxInstructions && pc < rom.length) {
    const byte = rom[pc];
    const addr = `0x${pc.toString(16).padStart(4, '0')}`;
    
    // Very basic Z80 instruction decoding
    let mnemonic = '?';
    let operand = '';
    let bytesConsumed = 1;

    if (byte === 0x00) mnemonic = 'NOP';
    else if (byte === 0x76) mnemonic = 'HALT';
    else if (byte === 0xc9) mnemonic = 'RET';
    else if (byte === 0xfb) mnemonic = 'EI';
    else if (byte === 0xf3) mnemonic = 'DI';
    else if (byte === 0xc0) mnemonic = 'RET NZ';
    else if (byte === 0xc8) mnemonic = 'RET Z';
    else if ((byte & 0xf0) === 0xc0 && (byte & 0x0f) < 8) {
      const cc = byte & 0x07;
      const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      mnemonic = `RET ${ccNames[cc]}`;
    } else if (byte === 0xed && pc + 1 < rom.length) {
      const sub = rom[pc + 1];
      if (sub === 0x4d) mnemonic = 'RETI';
      else if (sub === 0x45) mnemonic = 'RETN';
      else mnemonic = `ED ${sub.toString(16).padStart(2, '0')}`;
      bytesConsumed = 2;
    } else if (byte === 0xcd && pc + 2 < rom.length) {
      const lo = rom[pc + 1];
      const hi = rom[pc + 2];
      const target = (hi << 8) | lo;
      mnemonic = `CALL`;
      operand = `0x${target.toString(16).padStart(4, '0')}`;
      bytesConsumed = 3;
    } else if ((byte & 0xc0) === 0xc0 && (byte & 0x38) === 0x00 && pc + 2 < rom.length) {
      const lo = rom[pc + 1];
      const hi = rom[pc + 2];
      const target = (hi << 8) | lo;
      const cc = (byte >> 3) & 0x07;
      const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
      mnemonic = `JP ${ccNames[cc]}`;
      operand = `0x${target.toString(16).padStart(4, '0')}`;
      bytesConsumed = 3;
    } else if (byte === 0xc3 && pc + 2 < rom.length) {
      const lo = rom[pc + 1];
      const hi = rom[pc + 2];
      const target = (hi << 8) | lo;
      mnemonic = 'JP';
      operand = `0x${target.toString(16).padStart(4, '0')}`;
      bytesConsumed = 3;
    } else if ((byte & 0xff) === 0xd3 && pc + 1 < rom.length) {
      const port = rom[pc + 1];
      mnemonic = 'OUT';
      operand = `(0x${port.toString(16).padStart(2, '0')}), A`;
      bytesConsumed = 2;
    } else if ((byte & 0xff) === 0xdb && pc + 1 < rom.length) {
      const port = rom[pc + 1];
      mnemonic = 'IN';
      operand = `A, (0x${port.toString(16).padStart(2, '0')})`;
      bytesConsumed = 2;
    } else {
      mnemonic = byte.toString(16).padStart(2, '0').toUpperCase();
    }

    console.log(`${addr}  ${mnemonic.padEnd(15)} ${operand}`);
    
    pc += bytesConsumed;
    instructionCount++;
  }

  console.log('\n=== ANALYSIS ===');
  console.log('Looking for PSG writes (OUT 0x7F) or CALL to audio driver code.');
  console.log('If none found, audio initialization may be elsewhere or conditional.');
};

analyzeISRCode().catch(console.error);
