#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';

// Trace early IO reads/writes and VDP status vblank cadence for first few frames
const root = process.cwd();
const romPath = process.env.WONDERBOY_SMS_ROM || join(root,'wonderboy5.sms');
const biosPath = process.env.SMS_BIOS_ROM || join(root,'mame-roms/sms/mpr-12808.ic2');
if (!existsSync(romPath)) throw new Error('ROM missing');
const rom = new Uint8Array(readFileSync(romPath));
const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;

const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios } });
const vdp = m.getVDP();
const s0 = vdp.getState?.();
const cpl = (s0?.cyclesPerLine ?? 228);
const lpf = (s0?.linesPerFrame ?? 262);

const ioSampleLimit = 2000;
let ioReads = 0;

// Wrap bus IO to log first N events for ports 0xBF, 0xDC, 0xDD
const bus = m.getBus();
const origReadIO8 = (bus as any).readIO8.bind(bus);
(bus as any).readIO8 = (port: number): number => {
  const v = origReadIO8(port) & 0xff;
  const p = port & 0xff;
  if (ioReads < ioSampleLimit && (p === 0xbf || p === 0xdc || p === 0xdd)) {
    const st = vdp.getState?.();
    console.log(`IOREAD p=0x${p.toString(16).padStart(2,'0')} v=0x${v.toString(16).padStart(2,'0')} frame=${frame} line=${line} status=0x${(st?.status??0).toString(16).padStart(2,'0')} R1=0x${(st?.regs?.[1]??0).toString(16).padStart(2,'0')}`);
    ioReads++;
  }
  return v;
};

let frame = 0, line = 0;
for (frame = 0; frame < 3; frame++) {
  for (line = 0; line < lpf; line++) {
    m.runCycles(cpl);
    // On vblank start, print a marker
    const st = vdp.getState?.();
    if (line === (st?.vblankStartLine ?? 192)) {
      console.log(`--- VBLANK start: frame=${frame} line=${line} status=0x${(st?.status??0).toString(16).padStart(2,'0')}`);
    }
  }
}

console.log('Early IO read samples:', ioReads);
