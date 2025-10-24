import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';

const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (v: number): string => v.toString(16).toUpperCase().padStart(4, '0');

const parseListHex = (s: string | undefined, def: number[]): number[] => {
  if (!s || !s.trim()) return def;
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => parseInt(x, 16) & 0xffff);
};

const loadBytes = async (p: string): Promise<Uint8Array> => {
  const b = await fs.readFile(p);
  return new Uint8Array(b.buffer, (b as Buffer).byteOffset, (b as Buffer).byteLength);
};

async function main(): Promise<void> {
  const ROOT = process.cwd();
  const ROM = process.env.SMS_ROM ? (path.isAbsolute(process.env.SMS_ROM) ? process.env.SMS_ROM : path.join(ROOT, process.env.SMS_ROM)) : null;
  const BIOS = process.env.SMS_BIOS ? (path.isAbsolute(process.env.SMS_BIOS) ? process.env.SMS_BIOS : path.join(ROOT, process.env.SMS_BIOS)) : null;
  const MAX_STEPS = process.env.MAX_STEPS ? parseInt(process.env.MAX_STEPS, 10) : 200000;
  const WATCH_MEM = parseListHex(process.env.WATCH_MEM_ADDRS, [0xfffc, 0xfffd, 0xfffe, 0xffff]);
  const WATCH_IO = (process.env.WATCH_IO_PORTS || '3E,3F,BE,BF,7E,7F,DC,DD').split(',').map((s)=>parseInt(s.trim(),16)&0xff);
  const ANCHORS = new Set(parseListHex(process.env.ANCHORS, [0x7D96, 0x7D99, 0x7D9C, 0x7D9E]));

  if (!ROM) { console.error('Set SMS_ROM'); process.exit(1); }
  const [romBytes, biosBytes] = await Promise.all([
    loadBytes(ROM),
    BIOS ? loadBytes(BIOS) : Promise.resolve(null as any),
  ]);

  const machine = createMachine({ cart: { rom: romBytes }, bus: { allowCartRam: true, bios: biosBytes }, trace: { traceDisasm: false, traceRegs: false } });
  const cpu = machine.getCPU();
  const vdp = machine.getVDP();
  const psg = machine.getPSG();
  const bus = machine.getBus();

  // Timeline flags
  let biosDisabledObserved = false; // inferred from writes to 0x3E or 0xFFFC bit2
  let firstReachedAnchor: number | null = null;
  let firstEnteredWRAM: number | null = null; // first time PC in [C000..FFFF]

  const memSet = new Set<number>(WATCH_MEM.map((a)=>a&0xffff));
  const ioSet = new Set<number>(WATCH_IO.map((p)=>p&0xff));

  // Hook wrappers: we piggyback on stepping and check write/addrs around each step
  // We log sparingly to keep output concise.

  const logMemWrite = (addr: number, val: number, pc: number): void => {
    if (memSet.has(addr & 0xffff)) {
      console.log(`memwrite pc=${hex4(pc)} addr=${hex4(addr)} val=${hex2(val)}`);
      if ((addr & 0xffff) === 0xfffc && ((val & 0x04) !== 0) && !biosDisabledObserved) {
        biosDisabledObserved = true;
        console.log(`event BIOS_DISABLED (via 0xFFFC bit2) at pc=${hex4(pc)}`);
      }
    }
  };
  const logIOWrite = (port: number, val: number, pc: number): void => {
    if (ioSet.has(port & 0xff)) {
      console.log(`iowrite pc=${hex4(pc)} port=${hex2(port)} val=${hex2(val)}`);
      if ((port & 0xff) === 0x3e && ((val & 0x04) !== 0) && !biosDisabledObserved) {
        biosDisabledObserved = true;
        console.log(`event BIOS_DISABLED (via OUT(3E),A bit2) at pc=${hex4(pc)}`);
      }
    }
  };

  // Run loop
  for (let i = 0; i < MAX_STEPS; i++) {
    const s0 = cpu.getState();
    const pc0 = s0.pc & 0xffff;

    if (firstEnteredWRAM === null && pc0 >= 0xC000) {
      firstEnteredWRAM = i;
      console.log(`event ENTERED_WRAM pc=${hex4(pc0)} step=${i}`);
    }
    if (firstReachedAnchor === null && ANCHORS.has(pc0)) {
      firstReachedAnchor = pc0;
      console.log(`event REACHED_ANCHOR pc=${hex4(pc0)} step=${i}`);
      // Do not break; allow some more steps for context
    }

    // Step
    const r = cpu.stepOne();
    vdp.tickCycles(r.cycles);
    psg.tickCycles(r.cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();

    // After stepping, check if last op was an OUT or a memory write we care about
    // We infer OUTs by disassembly at pc0 and value via register A before step (best-effort)
    try {
      const txt = disassembleOne((addr:number)=>bus.read8(addr&0xffff)&0xff, pc0).text.toUpperCase();
      let m: RegExpMatchArray | null;
      if ((m = txt.match(/^OUT \((\$?[0-9A-F]{2}|C)\),A$/i)) != null) {
        let port: number | null = null;
        const arg = m[1]!.replace('$','');
        port = arg.toUpperCase() === 'C' ? (s0.c & 0xff) : (parseInt(arg, 16) & 0xff);
        const aVal = s0.a & 0xff;
        if (port !== null) logIOWrite(port, aVal, pc0);
      } else if ((m = txt.match(/^LD \((\$?[0-9A-F]{4})\),A$/i)) != null) {
        // Detect LD (nn),A into control regs (covers 0xFFFC..FFFF)
        const addr = parseInt(m[1]!.replace('$',''), 16) & 0xffff;
        logMemWrite(addr, s0.a & 0xff, pc0);
      } else if ((m = txt.match(/^LD \(HL\),A$/i)) != null) {
        const hl = ((s0.h & 0xff) << 8) | (s0.l & 0xff);
        if (memSet.has(hl & 0xffff)) logMemWrite(hl & 0xffff, s0.a & 0xff, pc0);
      }
    } catch {}

    // Early stop if reached all anchor points we care about
    if (firstReachedAnchor !== null && i > 1000) break;
  }

  console.log('--- summary ---');
  console.log(`steps_executed=${MAX_STEPS}`);
  console.log(`bios_disabled_observed=${biosDisabledObserved?1:0}`);
  console.log(`first_entered_wram_step=${firstEnteredWRAM!==null?firstEnteredWRAM:-1}`);
  console.log(`first_reached_anchor=${firstReachedAnchor!==null?hex4(firstReachedAnchor):'NONE'}`);
}

main().catch((e)=>{ console.error(e?.stack||String(e)); process.exit(1); });
