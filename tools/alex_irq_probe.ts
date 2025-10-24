import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import type { TraceEvent } from '../src/cpu/z80/z80.js';

// Usage:
//   ALEX_ROM=./alexkidd.sms npx tsx tools/alex_irq_probe.ts
//
// Prints, per frame:
// - Whether VDP IRQ is asserted at vblank start and whether it gets cleared
// - CPU IFF1/IM, HALT state, PC snapshot
// - Cumulative IRQ accept count, EI/DI counts
//
// Goal: quickly identify if the CPU ever enables interrupts and if maskable IRQs are being accepted.

const ROM_PATH = (process.env.ALEX_ROM && String(process.env.ALEX_ROM)) || './Alex Kidd - The Lost Stars (UE) [!].sms';
const FRAMES = Number(process.env.FRAMES || 120); // default 2 seconds
const CYCLES_PER_FRAME = 59736;

const rom = new Uint8Array(readFileSync(ROM_PATH));
const cart: Cartridge = { rom };

let eiCount = 0;
let diCount = 0;
let irqAcceptedTotal = 0;

const m = createMachine({
  cart,
  fastBlocks: false,
  trace: {
    onTrace: (ev: TraceEvent) => {
      if (ev.opcode === 0xfb) eiCount++;
      if (ev.opcode === 0xf3) diCount++;
      if (ev.irqAccepted) irqAcceptedTotal++;
    },
    traceDisasm: false,
    traceRegs: false,
  },
});

const cpu = m.getCPU();
const vdp = m.getVDP() as any;

console.log('=== Alex IRQ Probe ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Frames: ${FRAMES}`);
console.log('');

for (let frame = 0; frame < FRAMES; frame++) {
  // Before running the frame, snapshot beginning-of-frame VDP state
  const s0 = vdp.getState?.();
  const irqBefore = vdp.hasIRQ?.() ?? false;

  m.runCycles(CYCLES_PER_FRAME);

  // After one frame
  const s1 = vdp.getState?.();
  const cpuState = cpu.getState();
  const irqAfter = vdp.hasIRQ?.() ?? false;

  // Derive whether VBlank IRQ asserted at least once this frame based on counters
  const irqAssertCount = s1?.irqAssertCount ?? 0;
  const vblankCount = s1?.vblankCount ?? 0;
  const statusReads = s1?.statusReadCount ?? 0;

  if (frame % 10 === 0) {
    console.log(
      `F${frame.toString().padStart(3)}: PC=${cpuState.pc.toString(16).padStart(4,'0')} IFF1=${cpuState.iff1?1:0} IM=${cpuState.im} HALT=${cpuState.halted?1:0} | ` +
      `VDP: IRQ=${irqAfter?1:0} vblks=${vblankCount} irqAsserts=${irqAssertCount} stReads=${statusReads} | ` +
      `counts: EI=${eiCount} DI=${diCount} IRQacc=${irqAcceptedTotal}`
    );
  }
}

const st = cpu.getState();
console.log('\n=== Summary ===');
console.log(`Final: PC=${st.pc.toString(16).padStart(4,'0')} IFF1=${st.iff1?1:0} IM=${st.im} HALT=${st.halted?1:0}`);
console.log(`Totals: EI=${eiCount}, DI=${diCount}, IRQ accepted=${irqAcceptedTotal}`);

