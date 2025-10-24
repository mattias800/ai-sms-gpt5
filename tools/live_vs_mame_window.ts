import { promises as fs } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import type { WaitStateHooks } from '../src/cpu/z80/z80.js';

interface StepRec {
  pc: number;
  iff1: boolean;
  im: number;
  irqAccepted: boolean;
  hasIRQ: boolean;
  statusReads: number;
}

const hex4 = (v: number): string => (v & 0xffff).toString(16).toUpperCase().padStart(4, '0');
const hex2 = (v: number): string => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

const ROM_PATH = process.env.ALEX_ROM || './Alex Kidd - The Lost Stars (UE) [!].sms';
const MAME_TRACE = process.env.MAME_TRACE || process.env.TRACE_FILE || '';
const STUCK_LO = parseInt(process.env.STUCK_LO || '0x8900');
const STUCK_HI = parseInt(process.env.STUCK_HI || '0x8BFF');
const WINDOW_STEPS = parseInt(process.env.WINDOW_STEPS || '5000');
const MAX_STEPS = parseInt(process.env.MAX_STEPS || '20000000');
// Optional global kill-after timer and quiet mode to reduce output/long runs
const KILL_MS = parseInt(process.env.KILL_AFTER_MS || '0');
const QUIET = (process.env.QUIET === '1' || process.env.QUIET === 'true');
// Prelude band to start fine capture before the stuck range
const PRELUDE_LO = parseInt(process.env.PRELUDE_LO || '0x8800');
const PRELUDE_HI = parseInt(process.env.PRELUDE_HI || String(STUCK_HI));
// Optional explicit fine-capture anchor: begin buffering once PC >= FINE_START
const FINE_START = process.env.FINE_START ? (parseInt(process.env.FINE_START, 16) & 0xffff) : null;
// Coarse-run config: run large chunks to approach prelude range quickly
const COARSE_CHUNK = parseInt(process.env.COARSE_CHUNK || '59736'); // ~1 frame
const COARSE_LIMIT = parseInt(process.env.COARSE_LIMIT || '5000');  // max chunks
const START_MS = Date.now();
const shouldAbort = (): boolean => (KILL_MS > 0) && ((Date.now() - START_MS) >= KILL_MS);

const run = async (): Promise<void> => {
  if (!MAME_TRACE) {
    console.error('ERROR: Set MAME_TRACE (or TRACE_FILE) to a MAME trace file.');
    process.exit(1);
  }
  const romBytes = new Uint8Array(await fs.readFile(ROM_PATH));
  const cart: Cartridge = { rom: romBytes };
  // Optional BIOS
  let biosBytes: Uint8Array | null = null;
  try {
    const biosPath = process.env.SMS_BIOS || '';
    if (biosPath) {
      const biosBuf = await fs.readFile(biosPath);
      biosBytes = new Uint8Array(biosBuf.buffer, (biosBuf as any).byteOffset ?? 0, biosBuf.byteLength);
    }
  } catch {}

  // Build machine; we'll step manually to capture a rolling window
  let ioStatusReads = 0;
  const ioReadCounts: Record<string, number> = {};
  const ioWriteCounts: Record<string, number> = {};
  const inc = (obj: Record<string, number>, key: number): void => { const k = (key & 0xff).toString(16).toUpperCase().padStart(2,'0'); obj[k] = (obj[k] ?? 0) + 1; };

  // Track counts without trace to minimize overhead
  let eiCount = 0, diCount = 0, retnCount = 0, retiCount = 0;
  let inBFImmCount = 0; // includes immediate DB BF and (C)==BF detections

  // Optional memory watch list (comma-separated hex addresses)
  const watchList: number[] = (process.env.WATCH_ADDRS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 16) & 0xffff);
  const watchPrev = new Map<number, number>();
  const watchChanges = new Map<number, { count: number; lastPc: number; lastVal: number }>();

  const m = createMachine({ cart, fastBlocks: true, bus: { allowCartRam: true, bios: biosBytes } });
  const cpu = m.getCPU();
  const vdp: any = m.getVDP();
  const psg = m.getPSG();
  const busRef: any = m.getBus();

  // IO write/read counters for selected ports
  const selPorts = ['BF','BE','7F','7E','DC','DD','3E','3F'];
  const selPortsSet = new Set(selPorts.map(k => parseInt(k, 16) & 0xff));
  // IO increment helper for selected ports
  const incIO = (obj: Record<string, number>, port: number): void => { const k = (port & 0xff).toString(16).toUpperCase().padStart(2,'0'); obj[k] = (obj[k] ?? 0) + 1; };

  // Initialize watch previous values
  try {
    for (const a of watchList) {
      const v = busRef.read8(a) & 0xff;
      watchPrev.set(a, v);
      watchChanges.set(a, { count: 0, lastPc: 0, lastVal: v });
    }
  } catch {}
  // Optional: force-disable BIOS overlay to reach cartridge code faster
  try {
    if (process.env.BIOS_OFF === '1' || process.env.BIOS_OFF === 'true') {
      const curMC = (busRef.getMemControl?.() ?? 0) & 0xff;
      busRef.writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
    }
  } catch {}

  const ring: StepRec[] = new Array(WINDOW_STEPS);
  let head = 0;
  let count = 0;

  let prevHasIRQ = vdp.hasIRQ?.() ?? false;
  // IY+0 and IY+7 watch
  let iy0Prev = -1, iy7Prev = -1;
  let iy0Changes = 0, iy7Changes = 0;
  let iy0LastPc = 0, iy7LastPc = 0;

  let steps = 0;
  let entered = false;
  let fineCapture = false;

  // Phase 1: coarse-run in big cycle chunks until we reach the prelude band (or the stuck range)
  let coarseChunks = 0;
  while (!fineCapture && !entered && coarseChunks < COARSE_LIMIT && !shouldAbort()) {
    m.runCycles(COARSE_CHUNK);
    const pcNow = cpu.getState().pc & 0xffff;
    if ((FINE_START !== null && pcNow >= FINE_START) || (pcNow >= PRELUDE_LO && pcNow <= PRELUDE_HI)) {
      fineCapture = true;
      head = 0; count = 0; // start a clean window capture in prelude
      break;
    }
    if (pcNow >= STUCK_LO && pcNow <= STUCK_HI) {
      // We hit the stuck band directly; still enter fine capture immediately to collect a short window
      fineCapture = true;
      entered = true;
      head = 0; count = 0;
      break;
    }
    coarseChunks++;
  }

  // Phase 2: fine per-instruction stepping with ring capture
  while (!entered && steps < MAX_STEPS && !shouldAbort()) {
    const sBefore = cpu.getState();
    const pc = sBefore.pc & 0xffff;

    // Switch to fine capture once we cross the FINE_START anchor or enter the prelude band
    if (!fineCapture && ( (FINE_START !== null ? (pc >= FINE_START) : (pc >= PRELUDE_LO && pc <= PRELUDE_HI)) )) {
      fineCapture = true;
      // reset ring so it only contains prelude-before-stuck steps
      head = 0; count = 0;
    }

    // Lightweight opcode checks (EI/DI and IN A,($BF))
    try {
      const b0 = busRef.read8(pc) & 0xff;
      if (b0 === 0xFB) eiCount++;
      else if (b0 === 0xF3) diCount++;
      else if (b0 === 0xDB) {
        // IN A,(n)
        const b1 = busRef.read8((pc + 1) & 0xffff) & 0xff;
        if (b1 === 0xBF) { inBFImmCount++; ioStatusReads++; incIO(ioReadCounts, 0xBF); }
        if (selPortsSet.has(b1)) incIO(ioReadCounts, b1);
      } else if (b0 === 0xD3) {
        // OUT (n),A
        const port = busRef.read8((pc + 1) & 0xffff) & 0xff;
        if (selPortsSet.has(port)) incIO(ioWriteCounts, port);
      } else if (b0 === 0xED) {
        const sub = busRef.read8((pc + 1) & 0xffff) & 0xff;
        // IN r,(C)
        if ((sub & 0xc7) === 0x40) {
          const rCode = (sub >>> 3) & 7;
          const regs = cpu.getState();
          const cVal = regs.c & 0xff;
          if (rCode !== 6 && cVal === 0xBF) { inBFImmCount++; ioStatusReads++; incIO(ioReadCounts, 0xBF); }
          if (selPortsSet.has(cVal)) incIO(ioReadCounts, cVal);
        }
        // OUT (C),r
        if ((sub & 0xc7) === 0x41) {
          const regs = cpu.getState();
          const cVal = regs.c & 0xff;
          if (selPortsSet.has(cVal)) incIO(ioWriteCounts, cVal);
        }
      }
    } catch {}

    const r = cpu.stepOne();
    vdp.tickCycles(r.cycles);
    psg.tickCycles(r.cycles);
    const has = vdp.hasIRQ?.() ?? false;
    if (has) cpu.requestIRQ();

    // IY watch (track IY+0 and IY+7 changes)
    try {
      const st = cpu.getState();
      const iy = st.iy & 0xffff;
      const iy0 = busRef.read8(iy) & 0xff;
      const iy7 = busRef.read8((iy + 7) & 0xffff) & 0xff;
      if (iy0Prev < 0) iy0Prev = iy0;
      if (iy7Prev < 0) iy7Prev = iy7;
      if (iy0 !== iy0Prev) { iy0Changes++; iy0LastPc = pc & 0xffff; iy0Prev = iy0; }
      if (iy7 !== iy7Prev) { iy7Changes++; iy7LastPc = pc & 0xffff; iy7Prev = iy7; }
    } catch {}

    // Only push into ring during fine capture window
    if (fineCapture) {
      // Memory watch sampling
      if (watchList.length > 0) {
        try {
          for (const a of watchList) {
            const cur = busRef.read8(a) & 0xff;
            const prev = watchPrev.get(a)!;
            if (cur !== prev) {
              const entry = watchChanges.get(a)!;
              entry.count = (entry.count + 1) | 0;
              entry.lastPc = pc & 0xffff;
              entry.lastVal = cur & 0xff;
              watchPrev.set(a, cur);
            }
          }
        } catch {}
      }
      const rec: StepRec = {
        pc,
        iff1: !!sBefore.iff1,
        im: sBefore.im as number,
        irqAccepted: !!r.irqAccepted,
        hasIRQ: has,
        statusReads: ioStatusReads,
      };
      ring[head] = rec;
      head = (head + 1) % WINDOW_STEPS;
      if (count < WINDOW_STEPS) count++;
    }

    // First entry into stuck range -> stop (detect on next PC so ring contains last prelude steps only)
    const nextPc = cpu.getState().pc & 0xffff;
    if (nextPc >= STUCK_LO && nextPc <= STUCK_HI) {
      entered = true;
      break;
    }

    steps++;
  }

  if (!entered) {
    if (shouldAbort()) {
      console.log(`Aborted after ${Date.now() - START_MS} ms due to KILL_AFTER_MS=${KILL_MS}`);
      process.exit(124);
    }
    console.log('(Did not reach target PC range; try raising MAX_STEPS)');
    process.exit(0);
  }

  // Extract linear ordered window
  const window: StepRec[] = [];
  for (let i = count; i > 0; i--) {
    const idx = (head - i + WINDOW_STEPS) % WINDOW_STEPS;
    window.push(ring[idx]!);
  }

  // Compute our stats over window
  const srStart = window.length > 0 ? window[0]!.statusReads : 0;
  const srEnd = window.length > 0 ? window[window.length - 1]!.statusReads : 0;
  const ourStatusReadsDelta = (srEnd - srStart) | 0;
  const ourIFF1SetSteps = window.reduce((a, r) => a + (r.iff1 ? 1 : 0), 0);
  const ourIrqAccepted = window.reduce((a, r) => a + (r.irqAccepted ? 1 : 0), 0);
  const firstInRange = window.find(r => (r.pc >= STUCK_LO && r.pc <= STUCK_HI));
  const startPC = firstInRange ? firstInRange.pc : window[Math.max(0, window.length - 1)]!.pc;

  console.log('=== Live window before first entry ===');
  console.log(`windowSteps=${window.length} startPC=${hex4(window[0]!.pc)} firstInRangePC=${hex4(startPC)} ourStatusReadsΔ=${ourStatusReadsDelta} IFF1_set_steps=${ourIFF1SetSteps} IRQaccepted=${ourIrqAccepted}`);
  console.log(`EI=${eiCount} DI=${diCount} RETN~=${retnCount} RETI~=${retiCount} IN_A_(BF)_op=${inBFImmCount} PRELUDE=[${hex4(PRELUDE_LO)}..${hex4(PRELUDE_HI)}]`);
  // I/O summary for select ports
  const selPorts2 = ['BF','BE','7F','7E','DC','DD','3E','3F'];
  const fmtIO = (obj: Record<string, number>): string => selPorts2.map(k => `${k}:${obj[k]??0}`).join(' ');
  console.log(`IO reads:  ${fmtIO(ioReadCounts)}`);
  console.log(`IO writes: ${fmtIO(ioWriteCounts)}`);

  // Parse MAME trace and extract comparable window starting at first occurrence of startPC
  const traceText = await fs.readFile(MAME_TRACE, 'utf8');
  const lines = traceText.split(/\r?\n/);
  const findIdx = lines.findIndex((ln) => ln.startsWith(`${hex4(startPC)}:`));
  if (findIdx < 0) {
    console.log(`MAME: start PC ${hex4(startPC)} not found in trace.`);
    process.exit(0);
  }
  // Take a prelude window from MAME ending at the first occurrence of startPC (to match our prelude window)
  const mLo = Math.max(0, findIdx - window.length);
  const mHi = findIdx; // exclusive of startPC line
  const mameWin = lines.slice(mLo, mHi);
  const reInBF = /\bin\s+a,\s*\(\$?BF\)/i; // matches "in   a,($BF)"
  const mameStatusReads = mameWin.reduce((a, ln) => a + (reInBF.test(ln) ? 1 : 0), 0);

  console.log('=== MAME prelude window summary ===');
  console.log(`MAME lines sampled=${mameWin.length} in a,($BF) count=${mameStatusReads}`);

  // Memory watch summary
  if (watchList.length > 0) {
    const fmt = (n: number): string => n.toString(16).toUpperCase().padStart(4,'0');
    console.log('\n=== Memory watch summary ===');
    for (const a of watchList) {
      const ent = watchChanges.get(a)!;
      const last = ent?.lastVal ?? (watchPrev.get(a) ?? 0);
      const lastPc = ent?.lastPc ?? 0;
      console.log(`addr=${fmt(a)} changes=${ent?.count ?? 0} lastVal=${(last & 0xff).toString(16).toUpperCase().padStart(2,'0')} lastPC=${fmt(lastPc)}`);
    }
    // IY-relative summary
    console.log(`IY+0 changes=${iy0Changes} lastPC=${fmt(iy0LastPc)} lastVal=${(iy0Prev&0xff).toString(16).toUpperCase().padStart(2,'0')}`);
    console.log(`IY+7 changes=${iy7Changes} lastPC=${fmt(iy7LastPc)} lastVal=${(iy7Prev&0xff).toString(16).toUpperCase().padStart(2,'0')}`);
  }

  // Preview last 24 lines before startPC for sanity
  if (!QUIET) {
    console.log('\n--- MAME prelude preview (last 24) ---');
    for (let i = Math.max(0, mameWin.length - 24); i < mameWin.length; i++) console.log(mameWin[i] ?? '');

    console.log('\n--- Live preview (last 24 steps) ---');
  for (let i = Math.max(0, window.length - 24); i < window.length; i++) {
    const r = window[i]!;
    console.log(`${hex4(r.pc)} IFF1=${r.iff1?1:0} IM=${r.im} IRQacc=${r.irqAccepted?1:0} IRQ=${r.hasIRQ?1:0} SR=${r.statusReads}`);
  }
  }
};

run().catch((e) => { console.error(e); process.exit(1); });

