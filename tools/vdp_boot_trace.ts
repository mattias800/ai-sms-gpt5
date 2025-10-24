import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

interface Event {
  frame: number;
  line: number;
  type: string;
  detail: string;
}

const romPath = process.env.SMS_ROM || 'game.sms';
const frames = parseInt(process.env.FRAMES || '5', 10) | 0;
const maxEvents = parseInt(process.env.MAX_EVENTS || '200', 10) | 0;
const forceDisplay = ((process.env.FORCE_DISPLAY_ON || '0') !== '0');
const burstWindowLines = parseInt(process.env.BURST_WINDOW || '10', 10) | 0;
const burstThreshold = parseInt(process.env.BURST_THRESHOLD || '64', 10) | 0;

const cart: Cartridge = { rom: readFileSync(romPath) };
const mach = createMachine({ cart });
const vdp = mach.getVDP();

const cpl = vdp.getState!().cyclesPerLine | 0;
const lpf = vdp.getState!().linesPerFrame | 0;

// Track deltas per-scanline
let prevR1 = vdp.getState!().regs[1] ?? 0;
let prevDisp = ((prevR1 & 0x40) !== 0);
let prevIrqEn = ((prevR1 & 0x20) !== 0);
let prevVramWrites = vdp.getState!().vramWrites | 0;
let prevNonZero = vdp.getState!().nonZeroVramWrites | 0;
let prevStatusReads = vdp.getState!().statusReadCount | 0;
let prevIrqAsserts = vdp.getState!().irqAssertCount | 0;
// Non-zero VRAM burst window tracking
const nzRing = new Array<number>(Math.max(1, burstWindowLines)).fill(0);
let nzIdx = 0;
let nzSum = 0;
let displayForced = false;

// First-occurrence markers
let firstDisplayOn: { frame: number; line: number } | null = null;
let firstVramNonZero: { frame: number; line: number; addr: number } | null = null;
let firstStatusRead: { frame: number; line: number } | null = null;
let firstIrqAssert: { frame: number; line: number } | null = null;

const events: Event[] = [];

for (let f = 0; f < frames; f++) {
  for (let ln = 0; ln < lpf; ln++) {
    mach.runCycles(cpl);
    const st = vdp.getState!();
    const r1 = st.regs[1] ?? 0;
    if (r1 !== prevR1) {
      events.push({ frame: f, line: ln, type: 'R1', detail: `0x${prevR1.toString(16).padStart(2,'0')} -> 0x${r1.toString(16).padStart(2,'0')}` });
      const disp = (r1 & 0x40) !== 0;
      const irq = (r1 & 0x20) !== 0;
      if (disp !== prevDisp) {
        events.push({ frame: f, line: ln, type: 'R1.display', detail: `${prevDisp?1:0} -> ${disp?1:0}` });
        if (disp && !firstDisplayOn) firstDisplayOn = { frame: f, line: ln };
      }
      if (irq !== prevIrqEn) events.push({ frame: f, line: ln, type: 'R1.vblank_irq', detail: `${prevIrqEn?1:0} -> ${irq?1:0}` });
      prevR1 = r1; prevDisp = disp; prevIrqEn = irq;
    }
    if (st.vramWrites !== prevVramWrites) {
      events.push({ frame: f, line: ln, type: 'VRAM.writes', detail: `${prevVramWrites} -> ${st.vramWrites}` });
      prevVramWrites = st.vramWrites | 0;
    }
    if (st.nonZeroVramWrites !== prevNonZero) {
      const delta = (st.nonZeroVramWrites | 0) - (prevNonZero | 0);
      events.push({ frame: f, line: ln, type: 'VRAM.nonZero', detail: `${prevNonZero} -> ${st.nonZeroVramWrites} last=0x${st.lastNonZeroVramAddr.toString(16).padStart(4,'0')}` });
      if (!firstVramNonZero && st.nonZeroVramWrites > 0) firstVramNonZero = { frame: f, line: ln, addr: st.lastNonZeroVramAddr | 0 };
      // Update burst window
      if (burstWindowLines > 0) {
        nzSum -= nzRing[nzIdx] | 0;
        nzRing[nzIdx] = Math.max(0, delta | 0);
        nzSum += nzRing[nzIdx] | 0;
        nzIdx = (nzIdx + 1) % nzRing.length;
        if (forceDisplay && !displayForced && nzSum >= burstThreshold) {
          // Force display on by setting R1 bit6
          const curR1 = (st.regs[1] ?? 0) & 0xff;
          const newR1 = (curR1 | 0x40) & 0xff;
          vdp.writePort(0xbf, newR1);
          vdp.writePort(0xbf, 0x80 | 0x01);
          displayForced = true;
          events.push({ frame: f, line: ln, type: 'FORCE.display.on', detail: `R1: 0x${curR1.toString(16).padStart(2,'0')} -> 0x${newR1.toString(16).padStart(2,'0')} (nzSum=${nzSum})` });
          if (!firstDisplayOn) firstDisplayOn = { frame: f, line: ln };
        }
      }
      prevNonZero = st.nonZeroVramWrites | 0;
    }
    if (st.statusReadCount !== prevStatusReads) {
      events.push({ frame: f, line: ln, type: 'VDP.status.read', detail: `${prevStatusReads} -> ${st.statusReadCount}` });
      if (!firstStatusRead && st.statusReadCount > 0) firstStatusRead = { frame: f, line: ln };
      prevStatusReads = st.statusReadCount | 0;
    }
    if (st.irqAssertCount !== prevIrqAsserts) {
      events.push({ frame: f, line: ln, type: 'VDP.irq.assert', detail: `${prevIrqAsserts} -> ${st.irqAssertCount}` });
      if (!firstIrqAssert && st.irqAssertCount > 0) firstIrqAssert = { frame: f, line: ln };
      prevIrqAsserts = st.irqAssertCount | 0;
    }
    if (events.length >= maxEvents) break;
  }
  if (events.length >= maxEvents) break;
}

// Final state snapshot
const fin = vdp.getState!();

console.log('=== VDP BOOT TRACE ===');
console.log(`ROM: ${romPath}`);
console.log(`Frames: ${frames} Sampled per-line (${lpf} lines/frame)`);
console.log(`Final R1=0x${(fin.regs[1] ?? 0).toString(16).toUpperCase().padStart(2,'0')} display=${((fin.regs[1] ?? 0)&0x40)?1:0} vblank_irq_en=${((fin.regs[1] ?? 0)&0x20)?1:0}`);
console.log(`vramWrites=${fin.vramWrites} nonZeroVramWrites=${fin.nonZeroVramWrites} lastNonZeroAddr=0x${fin.lastNonZeroVramAddr.toString(16).toUpperCase().padStart(4,'0')} cramWrites=${fin.cramWrites}`);
console.log(`statusReadCount=${fin.statusReadCount} irqAssertCount=${fin.irqAssertCount}`);
console.log('--- first milestones ---');
console.log(`firstDisplayOn: ${firstDisplayOn ? `F${firstDisplayOn.frame} L${firstDisplayOn.line}` : 'none'}`);
console.log(`firstVramNonZero: ${firstVramNonZero ? `F${firstVramNonZero.frame} L${firstVramNonZero.line} addr=0x${firstVramNonZero.addr.toString(16).toUpperCase().padStart(4,'0')}` : 'none'}`);
console.log(`firstStatusRead: ${firstStatusRead ? `F${firstStatusRead.frame} L${firstStatusRead.line}` : 'none'}`);
console.log(`firstIrqAssert: ${firstIrqAssert ? `F${firstIrqAssert.frame} L${firstIrqAssert.line}` : 'none'}`);
console.log('--- first events ---');
for (let i = 0; i < Math.min(events.length, 40); i++) {
  const e = events[i]!;
  console.log(`#${i} F${e.frame} L${e.line} ${e.type}: ${e.detail}`);
}
if (events.length > 40) console.log(`... (${events.length-40} more)`);

// Optional: render a frame to estimate visible content
const render = (vdp as any).renderFrame ? (vdp as any).renderFrame() : null;
if (render && render instanceof Uint8Array) {
  let nonBlack = 0;
  for (let i = 0; i < render.length; i += 3) {
    if (render[i] !== 0 || render[i+1] !== 0 || render[i+2] !== 0) nonBlack++;
  }
  console.log(`renderedNonBlackPixels=${nonBlack}`);
}

