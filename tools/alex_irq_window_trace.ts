import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

interface TraceRow {
  frame: number;
  line: number;
  hc: number;
  hasIRQ: number;
  status: number;
  pc: number;
  opcode: number | null;
  cycles: number; // cycles consumed by this instruction
  accepted: number; // 1 if IRQ accepted this step
}

const romPath = process.env.SMS_ROM || 'AlexKidd.sms';
const maxFrames = parseInt(process.env.FRAMES || '3', 10) | 0; // default 3 frames
const out = process.env.OUT || 'alex_irq_trace.csv';

const cart: Cartridge = { rom: readFileSync(romPath) };
const rows: TraceRow[] = [];
const forceEi = (process.env.FORCE_EI || '0') !== '0';

const machine = createMachine({
  cart,
  trace: {
    onTrace: (ev): void => {
      const vdp = machine.getVDP();
      const hasIRQ = vdp.hasIRQ() ? 1 : 0;
      // Read HCounter and VCounter without mutating timing too much
      const hc = machine.getBus().readIO8(0x7e) & 0xff;
      const line = machine.getVDP().getState!().line | 0;
      const status = machine.getVDP().getState!().status & 0xff;
rows.push({
        frame: frameCount,
        line,
        hc,
        hasIRQ,
        status,
        pc: ev.pcBefore & 0xffff,
        opcode: ev.opcode === null ? null : (ev.opcode & 0xff),
        cycles: ev.cycles | 0,
        accepted: ev.irqAccepted ? 1 : 0,
      });
    },
    traceDisasm: false,
    traceRegs: false,
  },
});

let frameCount = 0;
const cyclesPerLine = machine.getVDP().getState!().cyclesPerLine | 0; // ~228
const linesPerFrame = machine.getVDP().getState!().linesPerFrame | 0; // ~262
const cyclesPerFrame = cyclesPerLine * linesPerFrame;

// Enable VBlank IRQ on VDP (reg1 bit5) to log IRQ windows
const vdp = machine.getVDP();
// write R1=0x20
vdp.writePort(0xbf, 0x20);
vdp.writePort(0xbf, 0x80 | 0x01);

// Optionally force CPU to IM1 with IFF1 enabled to guarantee acceptance for measurement
if (forceEi) {
  const cpu = machine.getCPU();
  const st = cpu.getState();
  cpu.setState({ ...st, iff1: true, iff2: true, im: 1 });
}

while (frameCount < maxFrames) {
  machine.runCycles(cyclesPerFrame);
  frameCount++;
}

// Dump CSV
const header = 'frame,line,hc,hasIRQ,status,pc,opcode,cycles,accepted\n';
const csv = rows.map(r => [r.frame, r.line, r.hc, r.hasIRQ, `0x${r.status.toString(16).toUpperCase().padStart(2,'0')}`, `0x${r.pc.toString(16).toUpperCase().padStart(4,'0')}`, r.opcode === null ? '' : `0x${r.opcode.toString(16).toUpperCase().padStart(2,'0')}`, r.cycles, r.accepted].join(',')).join('\n');
writeFileSync(out, header + csv);

// eslint-disable-next-line no-console
console.log(`Wrote ${rows.length} rows to ${out} over ${frameCount} frames (cycles/frame=${cyclesPerFrame}).`);

