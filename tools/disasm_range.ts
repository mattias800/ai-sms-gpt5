import { createMachine } from '../src/machine/machine.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';
import { promises as fs } from 'fs';
import path from 'path';

const hex2 = (v: number): string => v.toString(16).padStart(2,'0').toUpperCase();
const hex4 = (v: number): string => v.toString(16).padStart(4,'0').toUpperCase();

async function main(): Promise<void> {
  const ROOT = process.cwd();
  const romPath = process.env.SMS_ROM ? (path.isAbsolute(process.env.SMS_ROM) ? process.env.SMS_ROM : path.join(ROOT, process.env.SMS_ROM)) : null;
  const biosPath = process.env.SMS_BIOS ? (path.isAbsolute(process.env.SMS_BIOS) ? process.env.SMS_BIOS : path.join(ROOT, process.env.SMS_BIOS)) : null;
  if (!romPath) throw new Error('Set SMS_ROM');
  const startHex = process.env.START ? parseInt(String(process.env.START),16)&0xffff : 0x0200;
  const count = process.env.COUNT ? parseInt(String(process.env.COUNT),10) : 32;
  const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
  const bios = biosPath ? new Uint8Array((await fs.readFile(biosPath)).buffer) : null;
  const machine = createMachine({ cart: { rom }, bus: { allowCartRam: true, bios }, trace: { } });
  const bus = machine.getBus();

  let pc = startHex & 0xffff;
  for (let i=0;i<count;i++) {
    const res = disassembleOne((addr:number):number => bus.read8(addr&0xffff)&0xff, pc);
    const bytes = res.bytes.map((b)=>hex2(b)).join(' ');
    console.log(`${hex4(pc)}: ${res.text.padEnd(18,' ')}  ${bytes}`);
    pc = (pc + res.bytes.length) & 0xffff;
  }
}

main().catch((e)=>{ console.error(e?.stack||String(e)); process.exit(1); });

