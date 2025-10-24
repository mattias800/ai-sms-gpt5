import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';

// Hunt the wait loop at PC=0x031C (BIT 0,(IY+0); JR Z,-6) and track D200 writes.
// Logs when D200 changes and when PC enters 0x031C. Stops after a short window.

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const bios = new Uint8Array(readFileSync('./bios13fx.sms'));

const m = createMachine({ cart: { rom }, bus: { allowCartRam: true, bios }, fastBlocks: false });
const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

const WATCH_ADDR = 0xD200;
let prev = bus.read8(WATCH_ADDR) & 0xff;

let steps = 0;
let enteredLoop = false;
let afterLoopSteps = 0;

const logD200 = (prefix: string): void => {
  const v = bus.read8(WATCH_ADDR) & 0xff;
  const v2 = bus.read8((WATCH_ADDR + 1) & 0xffff) & 0xff;
  const v3 = bus.read8((WATCH_ADDR + 2) & 0xffff) & 0xff;
  console.log(`${prefix} D200=${v.toString(16).padStart(2,'0')} D201=${v2.toString(16).padStart(2,'0')} D202=${v3.toString(16).padStart(2,'0')}`);
};

while (steps < 5_000_000) {
  const pc = cpu.getState().pc & 0xffff;
  const before = cpu.getState();
  const { cycles } = cpu.stepOne();
  vdp.tickCycles(cycles);
  // PSG ticking not needed here
  if (vdp.hasIRQ()) cpu.requestIRQ();

  // Track D200 changes
  const cur = bus.read8(WATCH_ADDR) & 0xff;
  if (cur !== prev) {
    console.log(`step=${steps} pc=${pc.toString(16).padStart(4,'0')} D200: ${prev.toString(16).padStart(2,'0')} -> ${cur.toString(16).padStart(2,'0')}`);
    prev = cur;
  }

  // Detect entering the wait loop PC=0x031C
  if (!enteredLoop && pc === 0x031c) {
    enteredLoop = true;
    console.log(`Entered wait loop at step=${steps}`);
    logD200(' at-enter');
  }
  if (enteredLoop) {
    afterLoopSteps++;
    if (afterLoopSteps % 64 === 0) logD200(` loop+${afterLoopSteps}`);
    // Exit after we leave the loop once
    const nextPc = cpu.getState().pc & 0xffff;
    if (nextPc !== 0x0320 && nextPc !== 0x031c) {
      console.log(`Left loop at PC=${nextPc.toString(16)} after ${afterLoopSteps} steps`);
      logD200(' at-exit');
      break;
    }
    if (afterLoopSteps > 10000) {
      console.log('Still in loop after 10k steps, aborting');
      logD200(' at-abort');
      break;
    }
  }

  steps++;
}

