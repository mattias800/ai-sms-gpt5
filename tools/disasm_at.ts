#!/usr/bin/env npx tsx
import * as fs from 'fs';
import { disassembleOne } from '../src/cpu/z80/disasm.js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: npx tsx tools/disasm_at.ts <rom_file> <address_hex> [count]');
  console.log('Example: npx tsx tools/disasm_at.ts sonic.sms 02a9 10');
  process.exit(1);
}

const romPath = args[0] ?? "";
const startAddr = parseInt(args[1] ?? "0", 16);
const count = args[2] ? parseInt(args[2]) : 10;

if (!fs.existsSync(romPath)) {
  console.error(`ROM not found: ${romPath}`);
  process.exit(1);
}

const romData = new Uint8Array(fs.readFileSync(romPath));

console.log(`\nDisassembly of ${romPath} at 0x${startAddr.toString(16).padStart(4, '0')}:\n`);

const read8 = (addr: number): number => romData[addr & 0xffff] ?? 0;

let addr = startAddr;
for (let i = 0; i < count && addr < romData.length; i++) {
  const result = disassembleOne(read8, addr);
  const bytes = result.bytes.map((b: any) => b.toString(16).padStart(2, '0'));
  console.log(`${addr.toString(16).padStart(4, '0')}: ${bytes.join(' ').padEnd(12)} ${result.text}`);
  addr += result.length;
}
