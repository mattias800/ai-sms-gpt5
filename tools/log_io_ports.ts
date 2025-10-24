#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

// Count IO writes by port to see what BIOS uses for VDP control/data
const romPath = process.env.WONDERBOY_SMS_ROM || 'wonderboy5.sms';
const biosPath = process.env.SMS_BIOS_ROM || 'mame-roms/sms/mpr-12808.ic2';

const cart: Cartridge = { rom: readFileSync(romPath) };
let bios: Uint8Array | null = null;
try { bios = new Uint8Array(readFileSync(biosPath)); } catch {}

const portCounts = new Map<number, number>();
const sampleLimit = parseInt(process.env.SAMPLES || '200000', 10) | 0;

const m = createMachine({ cart, useManualInit: bios ? false : true, bus: { bios }, cpuDebugHooks: {
  onIOWrite: (port, val, pc) => {
    const p = port & 0xff;
    portCounts.set(p, (portCounts.get(p) ?? 0) + 1);
    // Optionally echo first few writes to suspicious ranges
    if (portCounts.get(p) === 1 && ((p & 0xfe) === 0xbe || (p & 0xfe) === 0x9e || (p & 0xfe) === 0xde || (p & 0xfe) === 0xfe || (p & 0xfe) === 0x7e)) {
      console.log(`first OUT to 0x${p.toString(16).toUpperCase().padStart(2,'0')} <= 0x${(val&0xff).toString(16).toUpperCase().padStart(2,'0')} @PC=0x${pc.toString(16).toUpperCase().padStart(4,'0')}`);
    }
  }
}});

const vdp = m.getVDP();
const state0 = vdp.getState?.();
const cyclesPerFrame = (state0?.cyclesPerLine ?? 228) * (state0?.linesPerFrame ?? 262);

let cycles = 0;
while (cycles < sampleLimit) {
  m.runCycles(1000);
  cycles += 1000;
}

// Dump top ports by count
const arr = Array.from(portCounts.entries());
arr.sort((a,b)=>b[1]-a[1]);
console.log('Top IO write ports:');
for (let i=0;i<Math.min(arr.length, 32); i++) {
  const [p,c] = arr[i]!;
  console.log(`#${i+1}: 0x${p.toString(16).toUpperCase().padStart(2,'0')} -> ${c}`);
}
