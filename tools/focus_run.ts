import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';
import path from 'path';
import { disassembleOne } from '../src/cpu/z80/disasm.js';

const hex2 = (v: number): string => v.toString(16).padStart(2, '0').toUpperCase();
const hex4 = (v: number): string => v.toString(16).padStart(4, '0').toUpperCase();

async function main(): Promise<void> {
  const ROOT = process.cwd();
  const romPath = process.env.SMS_ROM ? (path.isAbsolute(process.env.SMS_ROM) ? process.env.SMS_ROM : path.join(ROOT, process.env.SMS_ROM)) : null;
  if (!romPath) { console.error('Set SMS_ROM to a ROM path'); process.exit(1); }
  const romBytes = new Uint8Array((await fs.readFile(romPath)).buffer);
  const focusPc = process.env.FOCUS_PC ? parseInt(process.env.FOCUS_PC, 16) & 0xffff : null;
  const steps = process.env.FOCUS_STEPS ? parseInt(process.env.FOCUS_STEPS, 10) : 256;
  const biosPath = process.env.SMS_BIOS ? (path.isAbsolute(process.env.SMS_BIOS) ? process.env.SMS_BIOS : path.join(ROOT, process.env.SMS_BIOS)) : null;
  const biosBytes = biosPath ? new Uint8Array((await fs.readFile(biosPath)).buffer) : null;

  const machine = createMachine({ cart: { rom: romBytes }, bus: { allowCartRam: true, bios: biosBytes }, trace: { traceDisasm: true, traceRegs: true } });
  const cpu = machine.getCPU();
  const vdp = machine.getVDP();
  const psg = machine.getPSG();

  // Run until PC == focusPc (if provided)
  if (focusPc !== null) {
    let guard = 50_000_000; // big guard
    while (guard-- > 0) {
      const s = cpu.getState();
      if ((s.pc & 0xffff) === focusPc) break;
      const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
    }
  }

  // Now log IO and memory for N steps
  const ioPorts: number[] = (process.env.IO_PORTS || 'BF,BE,7E,7F,DC,DD,3E,3F,CB')
    .split(',').map((s)=>parseInt(s.trim(),16)&0xff);

  // Optional memory watch list
  const watchMemList: number[] = (process.env.WATCH_MEM_ADDRS || '')
    .split(',').map((s)=>s.trim()).filter((s)=>s.length>0).map((s)=>parseInt(s,16)&0xffff);
  const bus = machine.getBus();
  const memPrev = new Map<number, number>();
  for (const a of watchMemList) memPrev.set(a, bus.read8(a)&0xff);

  const printMemEach = process.env.PRINT_MEM_EACH === '1' || process.env.PRINT_MEM_EACH === 'true';

  for (let i=0;i<steps;i++) {
    const s0 = cpu.getState();
    const pc = s0.pc & 0xffff;
    const dis = disassembleOne((addr)=>bus.read8(addr&0xffff)&0xff, pc).text.toUpperCase();
    if (printMemEach && watchMemList.length>0) {
      const vals = watchMemList.map((a)=>`${hex4(a)}=${hex2(bus.read8(a)&0xff)}`).join(' ');
      const s = cpu.getState();
      console.log(`pc=${hex4(pc)} sp=${hex4(s.sp)} ${dis}  [${vals}]`);
    }
    // crude IN/OUT parsing
    let m: RegExpMatchArray | null;
    if ((m = dis.match(/^IN A,\((\$?[0-9A-F]{2}|C)\)$/i))!=null) {
      let port:number|null=null; const arg=m[1]!.replace('$',''); port = arg.toUpperCase()==='C' ? (s0.c&0xff) : (parseInt(arg,16)&0xff);
      const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
      const a = cpu.getState().a & 0xff;
      if (port!==null && ioPorts.includes(port)) console.log(`io IN  pc=${hex4(pc)} port=${hex2(port)} -> A=${hex2(a)}`);
    } else if ((m = dis.match(/^OUT \((\$?[0-9A-F]{2}|C)\),A$/i))!=null) {
      let port:number|null=null; const arg=m[1]!.replace('$',''); port = arg.toUpperCase()==='C' ? (s0.c&0xff) : (parseInt(arg,16)&0xff);
      const a = s0.a & 0xff;
      const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
      if (port!==null && ioPorts.includes(port)) console.log(`io OUT pc=${hex4(pc)} port=${hex2(port)} A=${hex2(a)}`);
    } else {
      const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
    }
    // After step, check watched memory
    if (watchMemList.length>0) {
      for (const a of watchMemList) {
        const cur = bus.read8(a)&0xff;
        const prev = memPrev.get(a)!;
        if (cur!==prev) {
          console.log(`memwatch pc=${hex4(pc)} addr=${hex4(a)}: ${hex2(prev)} -> ${hex2(cur)}`);
          memPrev.set(a, cur);
        }
      }
    }
  }
}

main().catch(e=>{ console.error(e?.stack||String(e)); process.exit(1); });

