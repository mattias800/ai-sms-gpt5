import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = process.env.SMS_ROM || 'game.sms';
const preFrames = parseInt(process.env.PREFRAMES || '10', 10) | 0;

const cart: Cartridge = { rom: readFileSync(romPath) };
const mach = createMachine({ cart });
const vdp = mach.getVDP();

// Run a few frames to settle
const cpl = vdp.getState!().cyclesPerLine | 0;
const lpf = vdp.getState!().linesPerFrame | 0;
const cpf = cpl * lpf;
for (let i = 0; i < preFrames; i++) mach.runCycles(cpf);

function writeReg(reg: number, val: number): void {
  vdp.writePort(0xbf, val & 0xff);
  vdp.writePort(0xbf, 0x80 | (reg & 0x0f));
}
function setVramAddr(addr: number): void {
  const a = addr & 0x3fff;
  vdp.writePort(0xbf, a & 0xff);
  vdp.writePort(0xbf, 0x40 | ((a >>> 8) & 0x3f));
}
function setCramAddr(idx: number): void {
  const i = idx & 0x1f;
  vdp.writePort(0xbf, i);
  vdp.writePort(0xbf, 0xc0);
}
function vdpData(val: number): void { vdp.writePort(0xbe, val & 0xff); }

// 1) Set CRAM color 1 to white (0x3F)
setCramAddr(1);
vdpData(0x3f);

// 2) Set name table base to 0x3800 via R2 (R2[3:1]=0x7 -> 0x3800)
writeReg(2, 0x0e);

// 3) Write a tile at 0x0000: color index 1 across all pixels
setVramAddr(0x0000);
for (let row = 0; row < 8; row++) {
  vdpData(0xff); // plane0
  vdpData(0x00); // plane1
  vdpData(0x00); // plane2
  vdpData(0x00); // plane3
}

// 4) Write name table entry at 0x3800 for top-left tile: tile index 0, no flags
setVramAddr(0x3800);
vdpData(0x00); // low
vdpData(0x00); // high

// 5) Enable display: R1 |= 0x40
const curR1 = vdp.getState!().regs[1] ?? 0;
writeReg(1, (curR1 | 0x40) & 0xff);

// Render a frame
const frame = (vdp as any).renderFrame ? (vdp as any).renderFrame() : null;
if (frame && frame instanceof Uint8Array) {
  let nonBlack = 0;
  for (let i = 0; i < frame.length; i += 3) {
    if (frame[i] !== 0 || frame[i+1] !== 0 || frame[i+2] !== 0) nonBlack++;
  }
  console.log(`force_render: nonBlackPixels=${nonBlack}`);
} else {
  console.log('force_render: no frame buffer available');
}

