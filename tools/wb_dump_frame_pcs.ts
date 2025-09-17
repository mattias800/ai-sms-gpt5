#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createMachine } from '../src/machine/machine.js';

const main = () => {
  const rom = new Uint8Array(readFileSync('./wonderboy5.sms'));
  // Use user's preferred BIOS path first
  const bios = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));

  const m = createMachine({ cart: { rom }, useManualInit: false, bus: { bios } });

  const vdp = m.getVDP();
  const cpu = m.getCPU();

  const st = vdp.getState?.();
  const cpl = st?.cyclesPerLine ?? 228;
  const lpf = st?.linesPerFrame ?? 262;
  const cpf = cpl * lpf;

  const pcs: number[] = [];
  for (let f = 1; f <= 120; f++) {
    m.runCycles(cpf);
    pcs.push(cpu.getState().pc & 0xffff);
  }

  // Print as lines matching the lua format (frame cycle pc opcode) but with opcode 00 and cycle 0
  for (let i = 0; i < pcs.length; i++) {
    const pc = pcs[i] >>> 0;
    console.log(`${i+1} 0 ${pc.toString(16).toUpperCase().padStart(4,'0')} 00`);
  }
};

main();
