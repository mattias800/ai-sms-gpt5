import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createZ80 } from '../src/cpu/z80/z80.js';
import { SmsBus, type Cartridge, type IBus } from '../src/bus/bus.js';
import { createVDP, type IVDP } from '../src/vdp/vdp.js';
import { createPSG, type IPSG } from '../src/psg/sn76489.js';
import { createTraceCollector } from '../src/debug/trace.js';
import { createSmsWaitHooks } from '../src/machine/waits.js';

interface ProbeOptions {
  steps: number;
  traceLimit: number;
  regLogLimit: number;
  override7E?: number | undefined;
  overrideFE?: number | undefined;
}

const parseArgs = (argv: string[]): { romPath: string; opts: ProbeOptions } => {
  if (argv.length < 1) {
    console.error(
      'Usage: node dist/scripts/probe_rom.js <rom.sms> [--steps N] [--trace N] [--reglog N] [--override-7e VAL] [--override-fe VAL]'
    );
    process.exit(1);
  }
  const romPath = argv[0]!;
  let steps = 200000;
  let traceLimit = 200;
  let regLogLimit = 50;
  let override7E: number | undefined;
  let overrideFE: number | undefined;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--steps' && i + 1 < argv.length) {
      steps = Math.max(1, parseInt(argv[++i]!, 10) || steps);
    } else if (a === '--trace' && i + 1 < argv.length) {
      traceLimit = Math.max(0, parseInt(argv[++i]!, 10) || traceLimit);
    } else if (a === '--reglog' && i + 1 < argv.length) {
      regLogLimit = Math.max(0, parseInt(argv[++i]!, 10) || regLogLimit);
    } else if (a === '--override-7e' && i + 1 < argv.length) {
      const v = argv[++i]!;
      const n = parseInt(v, v.startsWith('0x') ? 16 : 10);
      if (!Number.isNaN(n)) override7E = n & 0xff;
    } else if (a === '--override-fe' && i + 1 < argv.length) {
      const v = argv[++i]!;
      const n = parseInt(v, v.startsWith('0x') ? 16 : 10);
      if (!Number.isNaN(n)) overrideFE = n & 0xff;
    }
  }
  return { romPath, opts: { steps, traceLimit, regLogLimit, override7E, overrideFE } };
};

const findTagPositions = (rom: Uint8Array, tag: string): number[] => {
  const bytes = new TextEncoder().encode(tag);
  const out: number[] = [];
  outer: for (let i = 0; i + bytes.length <= rom.length; i++) {
    for (let j = 0; j < bytes.length; j++) {
      if ((rom[i + j] ?? 0) !== bytes[j]) continue outer;
    }
    out.push(i);
  }
  return out;
};

const main = (): void => {
  const { romPath, opts } = parseArgs(process.argv.slice(2));
  const buf = readFileSync(romPath);
  const rom = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const cart: Cartridge = { rom };

  // ROM sanity info
  const sizeKB = rom.length >> 10;
  const banks = Math.ceil(rom.length / 0x4000);
  const tagPos = findTagPositions(rom, 'TMR SEGA');

  console.log(`ROM: ${basename(romPath)} — ${rom.length} bytes (${sizeKB} KB), banks=${banks}`);
  if (tagPos.length > 0) {
    console.log(
      `Found 'TMR SEGA' signature at offsets: ${tagPos.map((p): string => '0x' + p.toString(16)).join(', ')}`
    );
  } else {
    console.log(`Warning: 'TMR SEGA' signature not found (common header tag)`);
  }
  if (rom.length % 0x4000 !== 0) {
    console.log(`Note: ROM size not multiple of 16KB — mapper will pad last bank reads`);
  }

  // Instrumented VDP/PSG
  const vdp = createVDP();
  let vdpDataWrites = 0;
  let vdpCtrlWrites = 0;
  // Probe-level decode of VDP register writes via control port (0xBF)
  let vdpCtrlLatch: number | null = null;
  const vdpRegWrites = new Array<number>(32).fill(0);
  let vdpReg1Enabled = false;
  const vdpRegEvents: string[] = [];
  const vdpProxy: IVDP = {
    readPort: (p: number): number => vdp.readPort(p),
    writePort: (p: number, v: number): void => {
      const port = p & 0xff;
      const val = v & 0xff;
      if (port === 0xbe) vdpDataWrites++;
      if (port === 0xbf) {
        vdpCtrlWrites++;
        if (vdpCtrlLatch === null) {
          vdpCtrlLatch = val;
        } else {
          // If second byte has bit7 set => register write
          if ((val & 0x80) !== 0) {
            const reg = val & 0x0f;
            const low = vdpCtrlLatch & 0xff;
            vdpRegWrites[reg] = ((vdpRegWrites[reg] ?? 0) + 1) | 0;
            if (vdpRegEvents.length < opts.regLogLimit) {
              vdpRegEvents.push(`R${reg}<=${low.toString(16).padStart(2, '0')}`);
            }
            if (reg === 1) {
              const nowEnabled = (low & 0x20) !== 0;
              if (nowEnabled && !vdpReg1Enabled) {
                vdpRegEvents.push('VDP: reg1 bit5 (VBlank IRQ enable) set');
              }
              vdpReg1Enabled = nowEnabled;
            }
          }
          vdpCtrlLatch = null;
        }
      }
      vdp.writePort(port, val);
    },
    tickCycles: (c: number): void => vdp.tickCycles(c),
    hasIRQ: (): boolean => vdp.hasIRQ(),
  };

  let psgWrites = 0;
  const psg = createPSG();
  const psgProxy: IPSG = {
    write: (val: number): void => {
      psgWrites++;
      psg.write(val);
    },
    tickCycles: (c: number): void => psg.tickCycles(c),
    getState: () => psg.getState(),
    getSample: () => psg.getSample(),
    reset: () => psg.reset(),
  };

  const bus = new SmsBus(cart, vdpProxy, psgProxy);
  // Optional overrides to experiment with ROM hardware detection loops
  let ioReads7E = 0;
  let ioReadsFE = 0;
  let ioReadsOther = 0;
  const busProxy: IBus = {
    read8: (addr: number): number => bus.read8(addr),
    write8: (addr: number, val: number): void => bus.write8(addr, val),
    readIO8: (port: number): number => {
      const p = port & 0xff;
      if (p === 0x7e) {
        ioReads7E++;
        if (opts.override7E !== undefined) return opts.override7E & 0xff;
      }
      if (p === 0xfe) {
        ioReadsFE++;
        if (opts.overrideFE !== undefined) return opts.overrideFE & 0xff;
      }
      ioReadsOther++;
      return bus.readIO8(p);
    },
    writeIO8: (port: number, val: number): void => bus.writeIO8(port, val),
  };

  const coll = createTraceCollector({ showBytes: true, showFlags: true });
  const cpu = createZ80({
    bus: busProxy,
    onTrace: coll.onTrace,
    traceDisasm: true,
    traceRegs: true,
    waitStates: createSmsWaitHooks({ includeWaitInCycles: false, vdpPenalty: 4 }),
  });

  let steps = 0;
  let totalCycles = 0;
  let irqAccepted = 0;
  let nmiAccepted = 0;
  let exception: Error | null = null;

  try {
    for (; steps < opts.steps; steps++) {
      const { cycles, irqAccepted: ia, nmiAccepted: na } = cpu.stepOne();
      totalCycles += cycles;
      if (ia) irqAccepted++;
      if (na) nmiAccepted++;
      // advance devices
      vdpProxy.tickCycles(cycles);
      psgProxy.tickCycles(cycles);
      // wire IRQ
      if (vdpProxy.hasIRQ()) cpu.requestIRQ();
    }
  } catch (e) {
    exception = e as Error;
  }

  console.log('\n=== Probe summary ===');
  console.log(`Steps executed: ${steps}/${opts.steps}`);
  console.log(`Total CPU cycles: ${totalCycles}`);
  console.log(`IRQs accepted: ${irqAccepted}`);
  console.log(`NMIs accepted: ${nmiAccepted}`);
  console.log(`VDP writes: data=${vdpDataWrites}, control=${vdpCtrlWrites}`);
  // VDP register writes summary
  const regSummary = vdpRegWrites
    .map((cnt, idx) => (cnt > 0 ? `R${idx}x${cnt}` : ''))
    .filter(s => s !== '')
    .join(' ');
  console.log(`VDP reg writes: ${regSummary || '(none)'}`);
  console.log(`VDP reg1 VBlank IRQ enable seen: ${vdpReg1Enabled ? 'yes' : 'no'}`);
  if (vdpRegEvents.length > 0) {
    console.log(`VDP reg events (first ${vdpRegEvents.length}): ${vdpRegEvents.join(', ')}`);
  }
  console.log(`PSG writes: ${psgWrites}`);
  console.log(
    `I/O reads: port 0x7E=${ioReads7E}${opts.override7E !== undefined ? ' (override ' + opts.override7E.toString(16) + ')' : ''}, 0xFE=${ioReadsFE}${opts.overrideFE !== undefined ? ' (override ' + opts.overrideFE.toString(16) + ')' : ''}, other=${ioReadsOther}`
  );
  if (exception) {
    console.log(`Exception: ${exception.name}: ${exception.message}`);
    const st = cpu.getState();
    console.log(`At PC=0x${st.pc.toString(16).padStart(4, '0')} SP=0x${st.sp.toString(16).padStart(4, '0')}`);
  }

  if (opts.traceLimit > 0) {
    console.log(`\n=== First ${opts.traceLimit} trace lines ===`);
    for (let i = 0; i < Math.min(opts.traceLimit, coll.lines.length); i++) {
      console.log(coll.lines[i]!);
    }
  }
};

main();
