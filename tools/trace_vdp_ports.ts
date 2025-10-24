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
const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios }, cpuDebugHooks: {
  onIOWrite: (port, val, pc) => {
    if (port === 0xde || port === 0xdf || (port & 0x3f) === 0x3e || (port & 0x3f) === 0x3f) {
      console.log(`IOWRITE pc=${pc.toString(16)} port=${port.toString(16)} val=${val.toString(16)}`);
    }
  }
}});
const cpu = m.getCPU();
for (let i=0;i<10000;i++) cpu.stepOne();

