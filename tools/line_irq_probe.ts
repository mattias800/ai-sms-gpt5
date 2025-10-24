import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import type { TraceEvent, Z80DebugHooks, WaitStateHooks } from '../src/cpu/z80/z80.js';

// Usage:
//   ALEX_ROM=./alexkidd.sms npx tsx tools/line_irq_probe.ts
// Optional env:
//   FRAMES=600  STUCK_THRESH=500

const ROM_PATH = (process.env.ALEX_ROM && String(process.env.ALEX_ROM)) || './Alex Kidd - The Lost Stars (UE) [!].sms';
const FRAMES = Number(process.env.FRAMES || 600);
const CYCLES_PER_FRAME = 59736;
const STUCK_RANGE_LO = 0x8900;
const STUCK_RANGE_HI = 0x8bff;
const STUCK_THRESH = Number(process.env.STUCK_THRESH || 500);

console.log('=== Line IRQ Probe ===');
console.log(`ROM: ${ROM_PATH}`);

const rom = new Uint8Array(readFileSync(ROM_PATH));
const cart: Cartridge = { rom };

let stuckSteps = 0;
let needSample = false;

// Track VDP register writes via 0xBF control port
const vdpRegWrites: Array<{ pc: number; reg: number; val: number }> = [];
let bfLatch: number | null = null;

const dbg: Z80DebugHooks = {
  onIOWrite: (port: number, val: number, pc: number) => {
    const p = port & 0xff;
    const v = val & 0xff;
    if (p === 0xbf) {
      if (bfLatch === null) {
        bfLatch = v;
      } else {
        // Second byte; decode register write if code==2
        const code = (v >>> 6) & 0x03;
        if (code === 0x02) {
          const reg = v & 0x0f;
          const regVal = bfLatch & 0xff;
          if (reg === 0 || reg === 1 || reg === 10) {
            vdpRegWrites.push({ pc: pc & 0xffff, reg, val: regVal });
          }
        }
        bfLatch = null;
      }
    }
  },
};

// Count status reads via wait hooks (non-invasive)
let statusReadsTotal = 0;
const ws: WaitStateHooks = {
  enabled: true,
  includeWaitInCycles: false,
  onIORead: (port: number) => {
    const p = port & 0xff;
    if (p === 0xbf) statusReadsTotal++;
    return 0;
  },
};

const m = createMachine({
  cart,
  fastBlocks: false,
  trace: {
    onTrace: (ev: TraceEvent) => {
      const pc = ev.pcBefore & 0xffff;
      if (pc >= STUCK_RANGE_LO && pc <= STUCK_RANGE_HI) {
        stuckSteps++;
        if (stuckSteps === STUCK_THRESH) needSample = true;
      } else {
        // Reset if we leave the suspected loop
        if (!needSample) stuckSteps = 0;
      }
    },
    traceDisasm: false,
    traceRegs: false,
  },
  cpuDebugHooks: dbg,
});

// Inject wait-state hooks for non-invasive IO read counting
m.getCPU().setWaitStateHooks(ws);

const cpu = m.getCPU();
const vdp: any = m.getVDP();

// Run until we need to sample, or timeout
for (let frame = 0; frame < FRAMES && !needSample; frame++) {
  m.runCycles(CYCLES_PER_FRAME);
}

if (!needSample) {
  console.log('(Did not detect sustained execution in 0x89xx range; aborting)');
  process.exit(0);
}

// Sample one full frame with scanline granularity
const gs0 = vdp.getState?.();
const cpl: number = gs0?.cyclesPerLine ?? 228;
const lpf: number = gs0?.linesPerFrame ?? 262;

console.log('\n--- Sampling one frame of line IRQ behavior ---');
const before = vdp.getState?.();
const r0_before = before?.regs?.[0] ?? 0;
const r1_before = before?.regs?.[1] ?? 0;
const r10_before = before?.regs?.[10] ?? 0;
console.log(`Start regs: R0=${hex2(r0_before)} R1=${hex2(r1_before)} R10=${hex2(r10_before)} | R0.bit4(lineIRQ)=${(r0_before & 0x10) ? 1:0}`);

let lineIrqLines: number[] = [];
let vblankLines: number[] = [];
let irqLines: number[] = [];
let lcntSamples: Array<{ line: number; lc: number }> = [];
let reloadLines: number[] = [];

let prevLC = vdp.getState?.().lineCounter ?? 0;
let prevStatus = vdp.getState?.().status ?? 0;
let prevAsserts = vdp.getState?.().irqAssertCount ?? 0;

for (let ln = 0; ln < lpf; ln++) {
  m.runCycles(cpl);
  const st = vdp.getState?.();
  if (!st) continue;
  const lc = st.lineCounter | 0;
  const status = st.status | 0;
  const asserts = st.irqAssertCount | 0;
  const has = vdp.hasIRQ?.() ? 1 : 0;

  // Capture notable events
  if ((status & 0x20) !== 0) lineIrqLines.push(ln);
  if ((status & 0x80) !== 0) vblankLines.push(ln);
  if (has) irqLines.push(ln);

  // Detect reload (counter increased vs previous sample)
  if (((lc - prevLC) & 0xff) > 0 && ln > 0) reloadLines.push(ln);
  lcntSamples.push({ line: ln, lc });
  prevLC = lc;
  prevStatus = status;
  prevAsserts = asserts;
}

const after = vdp.getState?.();
const r0_after = after?.regs?.[0] ?? 0;
const r1_after = after?.regs?.[1] ?? 0;
const r10_after = after?.regs?.[10] ?? 0;
const statusReadsDelta = (after?.statusReadCount ?? 0) - (before?.statusReadCount ?? 0);

console.log(`End regs:   R0=${hex2(r0_after)} R1=${hex2(r1_after)} R10=${hex2(r10_after)} | statusReads(Δframe)=${statusReadsDelta}`);
console.log(`Line IRQ bit set this frame on lines: ${preview(lineIrqLines)}`);
console.log(`IRQ line asserted (hasIRQ) on lines: ${preview(irqLines)}`);
console.log(`VBlank status bit set on lines: ${preview(vblankLines)}`);

// Print a compact map of lineCounter at a few sample lines and any reloads detected
const sampleEvery = Math.max(1, Math.floor(lpf / 16));
const lcSummary: Array<{ line: number; lc: number }> = [];
for (let i = 0; i < lcntSamples.length; i += sampleEvery) lcSummary.push(lcntSamples[i]!);
console.log('lineCounter samples:', lcSummary.map(s=>`L${s.line}:${hex2(s.lc)}`).join(' '));
console.log('lineCounter reloads detected at lines:', reloadLines.slice(0, 16).join(','));

// Summarize any recent register writes of interest
if (vdpRegWrites.length) {
  const lastWrites = vdpRegWrites.slice(-12);
  console.log('\nRecent VDP reg writes (R0/R1/R10):');
  for (const w of lastWrites) {
    console.log(`  PC=${hex4(w.pc)} R${w.reg}<=${hex2(w.val)}`);
  }
} else {
  console.log('\n(No R0/R1/R10 writes observed during run)');
}

console.log('\nStatus reads total (approx via IO read hook):', statusReadsTotal);

function hex2(n: number): string { return '0x' + ((n|0) & 0xff).toString(16).toUpperCase().padStart(2,'0'); }
function hex4(n: number): string { return '0x' + ((n|0) & 0xffff).toString(16).toUpperCase().padStart(4,'0'); }
function preview(arr: number[], n: number = 24): string {
  if (!arr.length) return '(none)';
  const head = arr.slice(0, n).join(',');
  return arr.length > n ? `${head},... (total ${arr.length})` : head;
}

