import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import type { TraceEvent, Z80DebugHooks, WaitStateHooks } from '../src/cpu/z80/z80.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';

// Config
const ROM_PATH = (process.env.ALEX_ROM && String(process.env.ALEX_ROM)) || './Alex Kidd - The Lost Stars (UE) [!].sms';
const FRAMES = 600; // 10 seconds @60Hz
const CYCLES_PER_FRAME = 59736;
const STUCK_RANGE_LO = 0x8b00;
const STUCK_RANGE_HI = 0x8bff;
const STUCK_THRESH = 2000; // steps inside range before dumping
const TRACE_WINDOW = 1000; // last N steps to keep

interface TraceRec {
  pc: number;
  op: number | null;
  text?: string;
  a: number; f: number; b: number; c: number; d: number; e: number; h: number; l: number;
  iff1?: boolean;
  im?: number;
  halted?: boolean;
  hasIRQ?: boolean;
  vblank?: boolean;
  statusReads?: number;
}

const ring: TraceRec[] = new Array(TRACE_WINDOW);
let ringIdx = 0;
let ringCount = 0;

// In-range counters
let stepsInRange = 0;
let iff1SetInRange = 0;
let eiInRange = 0;
let diInRange = 0;
let irqAcceptedInRange = 0;

const pushTrace = (t: TraceRec) => {
  ring[ringIdx] = t;
  ringIdx = (ringIdx + 1) % TRACE_WINDOW;
  if (ringCount < TRACE_WINDOW) ringCount++;
};

// I/O and memory access histograms while in stuck window
const ioReads: Record<string, number> = {};
const ioWrites: Record<string, number> = {};
const memReads: Record<string, number> = {};
const memWrites: Record<string, number> = {};

const inc = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

function dump(): void {
  const recent: TraceRec[] = [];
  for (let i = 0; i < ringCount; i++) {
    const idx = (ringIdx - 1 - i + TRACE_WINDOW) % TRACE_WINDOW;
    recent.push(ring[idx]!);
  }
  recent.reverse();
  console.log('\n=== Alex Loop Probe Dump ===');
  // In-range summary
  console.log('In-range summary:');
  console.log(`  steps=${stepsInRange} EI=${eiInRange} DI=${diInRange} IRQaccepted=${irqAcceptedInRange} IFF1_set_steps=${iff1SetInRange}`);
  // Estimate status reads delta across window
  const srFirst = recent.length ? (recent[0]!.statusReads ?? 0) : 0;
  const srLast = recent.length ? (recent[recent.length-1]!.statusReads ?? 0) : 0;
  const srDelta = (srLast - srFirst) | 0;
  console.log(`  statusReadsΔ(recent)=${srDelta}`);

  console.log(`\nLast ${recent.length} steps:`);
  for (const r of recent) {
    const t = r.text ? ` ${r.text}` : '';
    const meta = (r.iff1!==undefined||r.hasIRQ!==undefined)
      ? ` [IFF1=${r.iff1?1:0} IM=${r.im??-1} H=${r.halted?1:0} IRQ=${r.hasIRQ?1:0} VBL=${r.vblank?1:0}]`
      : '';
    console.log(`PC=${r.pc.toString(16).padStart(4,'0')} OP=${r.op===null?'--':r.op.toString(16).padStart(2,'0')}${t}${meta}`);
  }
  const top = (obj: Record<string, number>, n = 16) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
  console.log('\nTop IO reads:', top(ioReads));
  console.log('Top IO writes:', top(ioWrites));
  console.log('Top MEM reads:', top(memReads));
  console.log('Top MEM writes:', top(memWrites));
}

const run = (): void => {
  const rom = new Uint8Array(readFileSync(ROM_PATH));
  const cart: Cartridge = { rom };

  // WaitState hooks to snoop reads without altering timing
  const ws: WaitStateHooks = {
    enabled: true,
    includeWaitInCycles: false,
    onMemoryRead: (addr: number) => { inc(memReads, addr.toString(16)); return 0; },
    onMemoryWrite: (addr: number) => { /* writes caught via debugHooks */ return 0; },
    onIORead: (port: number) => { inc(ioReads, (port&0xff).toString(16)); return 0; },
    onIOWrite: (port: number) => { /* writes caught via debugHooks */ return 0; },
  };

  const dbg: Z80DebugHooks = {
    onMemWrite: (addr: number, val: number) => { inc(memWrites, addr.toString(16)); },
    onIOWrite: (port: number, val: number) => { inc(ioWrites, (port&0xff).toString(16)); },
  };

  let stuckSteps = 0;
  let dumped = false;

  const m = createMachine({
    cart,
    wait: { smsModel: false },
    fastBlocks: false,
    trace: {
      onTrace: (ev: TraceEvent) => {
        // Record disasm only in stuck-range to keep overhead low
        const inRange = ev.pcBefore >= STUCK_RANGE_LO && ev.pcBefore <= STUCK_RANGE_HI;
        if (inRange) {
          stuckSteps++;
          stepsInRange++;
          if (ev.opcode === 0xfb) eiInRange++;
          if (ev.opcode === 0xf3) diInRange++;
          if (ev.irqAccepted) irqAcceptedInRange++;
          const dis = disassembleOne((a)=> rom[a & 0xffff] ?? 0, ev.pcBefore);
          const regs = ev.regs;
          // Snapshot debug CPU and VDP state for this step
          const ds = m.getDebugStats();
          const vdp = m.getVDP() as any;
          const vs = vdp.getState?.();
          const tr: TraceRec = {
            pc: ev.pcBefore & 0xffff,
            op: ev.opcode,
            text: dis.text,
            a: regs?.a ?? 0,
            f: regs?.f ?? 0,
            b: regs?.b ?? 0,
            c: regs?.c ?? 0,
            d: regs?.d ?? 0,
            e: regs?.e ?? 0,
            h: regs?.h ?? 0,
            l: regs?.l ?? 0,
            iff1: ds.iff1,
            im: ds.im,
            halted: ds.halted,
            hasIRQ: vdp.hasIRQ?.() ?? false,
            vblank: ((vs?.status ?? 0) & 0x80) !== 0,
            statusReads: vs?.statusReadCount ?? 0,
          };
          pushTrace(tr);
          if (!dumped && stuckSteps > STUCK_THRESH) { dump(); dumped = true; }
        } else {
          stuckSteps = 0;
        }
      },
      traceDisasm: false,
      traceRegs: true,
    },
    cpuDebugHooks: dbg,
  });

  // Inject wait-state hooks after machine creation
  m.getCPU().setWaitStateHooks(ws);

  for (let f = 0; f < FRAMES && !dumped; f++) {
    m.runCycles(CYCLES_PER_FRAME);
  }

  if (!dumped) {
    console.log('\n(No stuck loop detected in target range)');
  }
};

run();
