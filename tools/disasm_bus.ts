import { createMachine } from '../src/machine/machine.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';
import { readFileSync } from 'fs';

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const bios = new Uint8Array(readFileSync('./bios13fx.sms'));
const m = createMachine({ cart: { rom }, bus: { allowCartRam: true, bios }, fastBlocks: false });

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: tsx tools/disasm_bus.ts <addr-hex> [count]');
  process.exit(1);
}
const start = parseInt(args[0]!, 16) & 0xffff;
const count = args[1] ? parseInt(args[1]!, 10) : 12;

const bus = m.getBus();
const read8 = (addr: number): number => bus.read8(addr & 0xffff) & 0xff;

let pc = start;
for (let i = 0; i < count; i++) {
  const r = disassembleOne(read8, pc);
  const bytes = r.bytes.map(b => b.toString(16).padStart(2,'0')).join(' ');
  console.log(`${pc.toString(16).toUpperCase().padStart(4,'0')}: ${bytes.padEnd(12)}  ${r.text}`);
  pc = (pc + r.length) & 0xffff;
}

