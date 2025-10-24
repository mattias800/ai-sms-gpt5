#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { createMachine } from '../src/machine/machine.js';

const ROM = process.env.SMS_ROM || './wonderboy5.sms';
const BIOS = process.env.SMS_BIOS || './mpr-12808.ic2';
const TARGET_PC = process.env.TARGET_PC ? parseInt(String(process.env.TARGET_PC), 16) : 0xC700;
const STEPS = process.env.STEPS ? parseInt(String(process.env.STEPS), 10) : 100000;

const rom = new Uint8Array(readFileSync(ROM));
const bios = (()=>{ try { return new Uint8Array(readFileSync(BIOS)); } catch { return null; } })();
const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios } });
const cpu = m.getCPU();
const vdp = m.getVDP();

// Force PC to target anchor like the compare tool does post-BIOS
const s = cpu.getState();
s.pc = TARGET_PC & 0xffff;
cpu.setState(s);

let cycles = 0;
for (let i = 0; i < STEPS; i++) {
  const r = cpu.stepOne();
  cycles += r.cycles;
  vdp.tickCycles(r.cycles); // keep devices advancing for consistency
}

const st = vdp.getState?.();
const cyclesPerLine = st?.cyclesPerLine ?? 228;
const linesPerFrame = st?.linesPerFrame ?? 262;
const cyclesPerFrame = cyclesPerLine * linesPerFrame;
const frames = cycles / cyclesPerFrame;
const seconds = frames / 60;

console.log(JSON.stringify({
  steps: STEPS,
  cycles,
  cyclesPerLine,
  linesPerFrame,
  cyclesPerFrame,
  frames,
  seconds
}, null, 2));

