import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';

// Trace VDP vblank/IRQ behavior around the CPU wait loop at 0x031C/0x0320.
// Logs when we enter the loop, then for a focused window logs per-step VDP/CPU info
// and edge events (IRQ rise/fall, vblank flag set/clear, D200 changes, IRQ accept, ISR pc=0038).

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const bios = new Uint8Array(readFileSync('./bios13fx.sms'));

const m = createMachine({ cart: { rom }, bus: { allowCartRam: true, bios }, fastBlocks: false });
const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

const WATCH_ADDR = 0xD200;
const LOOP_PC_A = 0x031c;
const LOOP_PC_B = 0x0320;

const maxSeekSteps = 20_000_000;
const windowSteps = 3000; // focused logging window once we hit the loop

let steps = 0;
let entered = false;
let winRemain = 0;
let prevHasIRQ = vdp.hasIRQ();
let prevVBlank = (vdp.getState?.().status ?? 0) & 0x80 ? 1 : 0;
let prevD200 = bus.read8(WATCH_ADDR) & 0xff;

const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2,'0');
const hex4 = (v: number): string => v.toString(16).toUpperCase().padStart(4,'0');

const logStep = (tag: string): void => {
  const st = cpu.getState();
  const vs = vdp.getState?.();
  const hasIRQ = vdp.hasIRQ() ? 1 : 0;
  const vbEn = vs ? (vs.vblankIrqEnabled ? 1 : 0) : -1;
  const vline = vs ? (vs.line|0) : -1;
  const vstat = vs ? (vs.status & 0xff) : 0;
  const d200 = bus.read8(WATCH_ADDR) & 0xff;
  const iy0 = bus.read8(st.iy & 0xffff) & 0xff;
  process.stdout.write(`${tag} pc=${hex4(st.pc&0xffff)} irqEn=${st.iff1?1:0} hasIRQ=${hasIRQ} line=${vline} vb_en=${vbEn} vstat=${hex2(vstat)} D200=${hex2(d200)} IY0=${hex2(iy0)}\n`);
};

// Seek until we enter the loop
while (!entered && steps < maxSeekSteps) {
  const pc = cpu.getState().pc & 0xffff;
  if (pc === LOOP_PC_A || pc === LOOP_PC_B) {
    entered = true;
    winRemain = windowSteps;
    console.log(`ENTER_LOOP step=${steps} pc=${hex4(pc)}`);
    logStep('STATE');
    break;
  }
  const { cycles } = cpu.stepOne();
  vdp.tickCycles(cycles);
  if (vdp.hasIRQ()) cpu.requestIRQ();
  steps++;
}

if (!entered) {
  console.log('Did not reach loop within seek limit');
  process.exit(0);
}

// Focused window
while (winRemain > 0) {
  const before = cpu.getState();
  const { cycles, irqAccepted } = cpu.stepOne();
  vdp.tickCycles(cycles);
  if (vdp.hasIRQ()) cpu.requestIRQ();

  const st = cpu.getState();
  const vs = vdp.getState?.();
  const hasIRQ = vdp.hasIRQ() ? 1 : 0;
  const vblank = vs ? ((vs.status & 0x80) ? 1 : 0) : 0;
  const d200 = bus.read8(WATCH_ADDR) & 0xff;

  // Edge events
  if (irqAccepted) console.log(`EV IRQ_ACCEPT pc=${hex4(st.pc & 0xffff)}`);
  if (st.pc === 0x0038) console.log(`EV ISR_PC pc=0038`);
  if (hasIRQ && !prevHasIRQ) console.log(`EV IRQ_RISE pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
  if (!hasIRQ && prevHasIRQ) console.log(`EV IRQ_FALL pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
  if (vblank !== prevVBlank) console.log(`EV VBLANK_${vblank? 'SET':'CLR'} pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
  if (d200 !== prevD200) console.log(`EV D200 ${hex2(prevD200)} -> ${hex2(d200)} pc=${hex4(st.pc & 0xffff)}`);

  prevHasIRQ = !!hasIRQ; prevVBlank = vblank; prevD200 = d200;

  // Per-step summary while still in the loop or just after
  const pcNow = st.pc & 0xffff;
  if (pcNow === LOOP_PC_A || pcNow === LOOP_PC_B || winRemain % 32 === 0) logStep('STEP');

  winRemain--;
}

console.log('LOOP_WINDOW_END');

