import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

// Per-cycle tracer for CPU state and VDP IRQ wire around a PC window
// Usage (env):
//   SMS_ROM=./Alex\ Kidd\ -\ The\ Lost\ Stars\ (UE)\ [!].sms \
//   PC_MIN=0x8B00 PC_MAX=0x8C00 \
//   SKIP_FRAMES=180 CYCLES=200000 LIMIT_EVENTS=2000 \
//   npx tsx tools/trace_cycles.ts

const hex = (v: number, w = 2): string => '0x' + (v >>> 0).toString(16).padStart(w, '0');

const parseHex = (s: string | undefined, def: number): number => {
  if (!s) return def;
  const m = s.trim().toLowerCase();
  if (m.startsWith('0x')) return parseInt(m.slice(2), 16) >>> 0;
  return parseInt(m, 10) >>> 0;
};

const parseBool = (s: string | undefined, def = false): boolean => {
  if (!s) return def;
  const m = s.trim().toLowerCase();
  return m === '1' || m === 'true' || m === 'yes' || m === 'on';
};

const ROM_PATH = process.env.SMS_ROM ?? './Alex Kidd - The Lost Stars (UE) [!].sms';
const PC_MIN = parseHex(process.env.PC_MIN, 0x8b00);
const PC_MAX = parseHex(process.env.PC_MAX, 0x8c00);
const SKIP_FRAMES = parseHex(process.env.SKIP_FRAMES, 0); // frames to skip before tracing
const SKIP_CYCLES = parseHex(process.env.SKIP_CYCLES, 0); // additional cycles to skip before tracing
const MAX_CYCLES = parseHex(process.env.CYCLES, 200_000);
const LIMIT_EVENTS = parseHex(process.env.LIMIT_EVENTS, 2000);
const SHOW_ALL = parseBool(process.env.SHOW_ALL, false);
const OUT_FILE = process.env.OUT_FILE ?? 'trace_cycles.log';

if (!existsSync(ROM_PATH)) {
  console.error(`ROM file not found: ${ROM_PATH}`);
  process.exit(1);
}

const rom = new Uint8Array(readFileSync(ROM_PATH));
const cart: Cartridge = { rom };

// Set up machine with per-cycle hook
let globalCycle = 0;
let lastIRQ = false;
let lastIFF1 = false;
let captured = 0;
let started = false;

const logLines: string[] = [];
const write = (line: string): void => {
  logLines.push(line);
  if (logLines.length % 500 === 0) process.stdout.write('.');
};

const m = createMachine({
  cart,
  // Ensure devices tick per CPU cycle; CPU already ticks them via onCycle
  cycleHook: () => {
    globalCycle++;
    if (!started) return;

    const cpu = m.getCPU();
    const vdp = m.getVDP();
    const st = cpu.getState();
    const pc = st.pc & 0xffff;
    const irq = vdp.hasIRQ();

    const inWindow = pc >= (PC_MIN & 0xffff) && pc <= (PC_MAX & 0xffff);
    const iff1 = !!st.iff1;

    // Log on window cycles, or when IRQ/iff1 toggles
    if (
      (SHOW_ALL || inWindow) ||
      irq !== lastIRQ ||
      iff1 !== lastIFF1
    ) {
      const line = `${globalCycle.toString().padStart(9, ' ')}  PC=${hex(pc, 4)}  IFF1=${iff1 ? '1' : '0'} IM=${st.im} HALT=${st.halted ? '1' : '0'}  IRQ=${irq ? '1' : '0'}`;
      write(line);
      captured++;
    }

    lastIRQ = irq;
    lastIFF1 = iff1;
  },
});

// Determine cycles per frame from VDP state
const vdp = m.getVDP() as any;
const gs0 = vdp.getState ? vdp.getState() : undefined;
const cyclesPerLine = (gs0?.cyclesPerLine ?? 228) | 0;
const linesPerFrame = (gs0?.linesPerFrame ?? 262) | 0;
const cyclesPerFrame = (cyclesPerLine * linesPerFrame) | 0;

console.log('=== Per-cycle trace ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`PC window: [${hex(PC_MIN, 4)} .. ${hex(PC_MAX, 4)}]`);
console.log(`Skip: ${SKIP_FRAMES} frames + ${SKIP_CYCLES} cycles, then trace up to ${MAX_CYCLES} cycles or ${LIMIT_EVENTS} events`);

// Skip initial frames/cycles to reach interesting region
if (SKIP_FRAMES > 0) m.runCycles((SKIP_FRAMES * cyclesPerFrame) | 0);
if (SKIP_CYCLES > 0) m.runCycles(SKIP_CYCLES | 0);

started = true;

// Run tracing in chunks; stop when limits reached
let remaining = MAX_CYCLES | 0;
const CHUNK = 10_000;
while (remaining > 0 && captured < LIMIT_EVENTS) {
  const step = Math.min(CHUNK, remaining);
  m.runCycles(step);
  remaining -= step;
}

started = false;

// Flush log
writeFileSync(OUT_FILE, logLines.join('\n') + '\n');

console.log('\n\n=== Trace summary ===');
console.log(`Total cycles observed after start: ${MAX_CYCLES - remaining}`);
console.log(`Events captured: ${captured}`);
console.log(`Log written to: ${OUT_FILE}`);

