#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createZ80 } from '../src/cpu/z80/z80.js';
import { SmsBus } from '../src/bus/bus.js';
import { createVDP } from '../src/vdp/vdp.js';
import { createPSG } from '../src/psg/sn76489.js';

const main = () => {
  const rom = new Uint8Array(readFileSync('./wonderboy5.sms'));
  const bios = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
  const vdp = createVDP();
  const psg = createPSG();
  const bus = new SmsBus({ rom }, vdp, psg, null, null, { allowCartRam: true, bios });
  const cpu = createZ80({
    bus,
    experimentalFastBlockOps: false,
    onCycle: (cycles: number) => {
      vdp.tickCycles(cycles);
      psg.tickCycles(cycles);
      if (vdp.hasIRQ()) cpu.requestIRQ();
    },
  });
  cpu.reset();
  cpu.stepOne(); // align

  for (let i = 1; i <= 60; i++) {
    const st = cpu.getState();
    const pc = st.pc & 0xffff;
    console.log(`${i.toString().padStart(3,' ')}: PC=${pc.toString(16).padStart(4,'0')} A=${st.a.toString(16).padStart(2,'0')} B=${st.b.toString(16).padStart(2,'0')} C=${st.c.toString(16).padStart(2,'0')} D=${st.d.toString(16).padStart(2,'0')} E=${st.e.toString(16).padStart(2,'0')} F=${st.f.toString(16).padStart(2,'0')}`);
    cpu.stepOne();
  }
};

main();
