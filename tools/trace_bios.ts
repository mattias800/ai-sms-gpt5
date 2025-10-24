#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';

const root = process.cwd();
const romPath = process.env.WONDERBOY_SMS_ROM || join(root,'wonderboy5.sms');
const biosPath = process.env.SMS_BIOS_ROM || join(root,'mame-roms/sms/mpr-12808.ic2');
if (!existsSync(romPath)) throw new Error('ROM missing');
const rom = new Uint8Array(readFileSync(romPath));
const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;
const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios }, trace: { traceDisasm: true, traceRegs: true }});
const cpu = m.getCPU();
console.log('Start PC=', cpu.getState().pc.toString(16));
for (let i=0;i<2000;i++) {
  const r = cpu.stepOne();
  if (i<20 || i%100===0) {
    const s = cpu.getState();
    console.log(i, 'PC', s.pc.toString(16).padStart(4,'0'),'IM', s.im, 'IFF1', s.iff1?'1':'0', 'HALT', s.halted?'1':'0', 'cycles', r.cycles);
  }
}

