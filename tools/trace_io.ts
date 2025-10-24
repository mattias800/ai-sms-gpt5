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

let vdpWrites = 0, psgWrites = 0, io3e = 0, io3f = 0, lastFew: Array<{i:number, pc:number, port:number, val:number}> = [];

const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios }, cpuDebugHooks: {
  onIOWrite: (port, val, pc) => {
    const low6 = port & 0x3f;
    if (low6 === 0x3e || low6 === 0x3f) vdpWrites++;
    if (port === 0x7f) psgWrites++;
    if (port === 0x3e) io3e++;
    if (port === 0x3f) io3f++;
    lastFew.push({ i: step, pc, port, val}); if (lastFew.length>10) lastFew.shift();
  }
}});
const cpu = m.getCPU();
let step = 0;
for (; step < 200000; step++) {
  cpu.stepOne();
}
console.log('steps=', step, 'vdpWrites=', vdpWrites, 'psgWrites=', psgWrites, 'io3e=', io3e, 'io3f=', io3f);
console.log('last few writes:', lastFew.map(e=>`#${e.i} pc=${e.pc.toString(16)} port=${e.port.toString(16)} val=${e.val.toString(16)}`).join('; '));

