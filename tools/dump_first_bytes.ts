#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SmsBus } from '../src/bus/bus.js';
import { createVDP } from '../src/vdp/vdp.js';
import { createPSG } from '../src/psg/sn76489.js';

const root = process.cwd();
const romPath = process.env.WONDERBOY_SMS_ROM || join(root,'wonderboy5.sms');
const biosPath = process.env.SMS_BIOS_ROM || join(root,'mame-roms/sms/mpr-12808.ic2');
if (!existsSync(romPath)) throw new Error('ROM missing');
const rom = new Uint8Array(readFileSync(romPath));
const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;
const cart = { rom };
const bus = new SmsBus(cart, createVDP(), createPSG(), null, null, { allowCartRam: true, bios });
console.log('biosEnabled?', (bus as any).getBiosEnabled ? (bus as any).getBiosEnabled() : 'unknown');
const firstCart = Array.from(rom.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
console.log('cart[0..7]=', firstCart);
if (bios) {
  const firstBios = Array.from(bios.slice(0,8)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
  console.log('bios[0..7]=', firstBios);
}
let firstBus: string[] = [];
for (let a=0;a<8;a++) firstBus.push((bus.read8(a)&0xff).toString(16).padStart(2,'0'));
console.log('bus[0..7]=', firstBus.join(' '));

