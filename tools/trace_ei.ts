import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import type { TraceEvent } from '../src/cpu/z80/z80.js';

const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (v: number): string => v.toString(16).toUpperCase().padStart(4, '0');

const loadFile = async (p: string): Promise<Uint8Array> => {
  const buf = await fs.readFile(p);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const ENV_ROM = process.env.SMS_ROM || './sonic.sms';
  const ENV_BIOS = process.env.SMS_BIOS || '';
  const FRAMES = process.env.FRAMES ? parseInt(process.env.FRAMES, 10) : 300; // ~5s
  const CYCLES_PER_FRAME = 59736; // NTSC approx

  const romPath = path.isAbsolute(ENV_ROM) ? ENV_ROM : path.join(ROOT, ENV_ROM);
  const biosPath = ENV_BIOS ? (path.isAbsolute(ENV_BIOS) ? ENV_BIOS : path.join(ROOT, ENV_BIOS)) : null;

  const [rom, bios] = await Promise.all([
    loadFile(romPath),
    biosPath ? loadFile(biosPath) : Promise.resolve<Uint8Array | null>(null),
  ]);

  const cart: Cartridge = { rom };

  let eiCount = 0;
  let lastIFF1 = false;
  let iff1TrueCount = 0;
  let irqAccepted = 0;
  let firstEIpc: number | null = null;
  let firstIFF1pc: number | null = null;

  const machine = createMachine({
    cart,
    bus: { allowCartRam: true, bios },
    fastBlocks: false,
    trace: {
      onTrace: (ev: TraceEvent): void => {
        // EI detection via opcode byte
        if (ev.opcode === 0xfb) {
          eiCount++;
          if (firstEIpc === null) firstEIpc = ev.pcBefore & 0xffff;
        }
        // IFF1 rising edge detection
        const st = machine.getCPU().getState();
        const cur = !!st.iff1;
        if (!lastIFF1 && cur) {
          iff1TrueCount++;
          if (firstIFF1pc === null) firstIFF1pc = ev.pcBefore & 0xffff;
        }
        lastIFF1 = cur;
        if (ev.irqAccepted) irqAccepted++;
      },
      traceDisasm: false,
      traceRegs: false,
    },
  });

  console.log('=== EI/IFF1/IRQ trace (Sonic) ===');
  console.log(`ROM: ${romPath}`);
  if (bios) console.log(`BIOS: ${biosPath}`);
  console.log(`Frames to run: ${FRAMES}`);

  for (let f = 0; f < FRAMES; f++) {
    machine.runCycles(CYCLES_PER_FRAME);
    if ((f % 60) === 0 || f === FRAMES - 1) {
      const s = machine.getCPU().getState();
      const v = machine.getVDP();
      const vstate = v.getState ? v.getState() : undefined;
      console.log(
        `Frame ${f}: PC=${hex4(s.pc)} IFF1=${s.iff1 ? '1' : '0'} IM=${s.im} EI#=${eiCount} IFF1+ #=${iff1TrueCount} IRQacc#=${irqAccepted}`
      );
      if (vstate) {
        console.log(
          `  VDP: line=${vstate.line} VBlankIRQ=${vstate.vblankIrqEnabled ? 'on' : 'off'} IRQwire=${v.hasIRQ() ? '1' : '0'} VRAMw=${vstate.vramWrites}`
        );
      }
    }
  }

  if (eiCount === 0) console.log('⚠️ EI never executed');
  if (iff1TrueCount === 0) console.log('⚠️ IFF1 never became true');
  if (irqAccepted === 0) console.log('⚠️ No IRQs accepted');

  if (firstEIpc !== null) console.log(`First EI at PC=${hex4(firstEIpc)}`);
  if (firstIFF1pc !== null) console.log(`First IFF1=true observed near PC=${hex4(firstIFF1pc)}`);
};

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});

