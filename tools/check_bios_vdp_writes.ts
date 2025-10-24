#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';

// Run BIOS and report if BIOS performs any VDP control writes and when display is enabled
const root = process.cwd();
const romPath = process.env.WONDERBOY_SMS_ROM || join(root,'wonderboy5.sms');
const biosPath = process.env.SMS_BIOS_ROM || join(root,'mame-roms/sms/mpr-12808.ic2');
if (!existsSync(romPath)) throw new Error('ROM missing');
const rom = new Uint8Array(readFileSync(romPath));
const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;

const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios } });
const vdp = m.getVDP();
const st0 = vdp.getState?.();
const cpf = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);

let r1OnAt: { frame:number; line:number } | null = null;
let r7WriteCount = 0;
// Latch control writes
const origWrite = vdp.writePort.bind(vdp);
let latch: number | null = null;
vdp.writePort = (port: number, val: number) => {
  const p = port & 0xff, v = val & 0xff;
  if (p === 0xbf) {
    if (latch === null) latch = v; else { const low=latch; latch=null; const high=v; const code=(high>>>6)&3; if (code===2){ const reg=high&0x0f; if (reg===1){ const s=vdp.getState?.(); if (!r1OnAt && ((low&0x40)!==0)){ r1OnAt={ frame: curF, line: curL }; } } if (reg===7){ r7WriteCount++; } } }
  }
  return origWrite(port, val);
};

let curF=0, curL=0;
for (curF=0; curF<10; curF++) {
  for (curL=0; curL<(st0?.linesPerFrame ?? 262); curL++) {
    m.runCycles((st0?.cyclesPerLine ?? 228));
    const st = vdp.getState?.();
    if (st?.displayEnabled && !r1OnAt) r1OnAt = { frame: curF, line: curL };
  }
}

const st = vdp.getState?.();
console.log('After 10 frames: display=', st?.displayEnabled, 'R1=', st?.regs?.[1]?.toString(16), 'R7=', st?.regs?.[7]?.toString(16), 'r7Writes=', r7WriteCount, 'r1OnAt=', r1OnAt);
