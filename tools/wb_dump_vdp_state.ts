#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'node:fs';
import { createMachine } from '../src/machine/machine.js';

const main = () => {
  const rom = new Uint8Array(readFileSync('./wonderboy5.sms'));
  const bios = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
  const m = createMachine({ cart: { rom }, useManualInit: false, bus: { bios } });
  const vdp = m.getVDP();

  const cyclesPerFrame = (vdp.getState?.()?.cyclesPerLine ?? 228) * (vdp.getState?.()?.linesPerFrame ?? 262);

  const logs: string[] = [];
  const push = (s: string) => { console.log(s); logs.push(s); };

  for (let f = 1; f <= 120; f++) {
    m.runCycles(cyclesPerFrame);
    const st = vdp.getState?.();
    const pc = m.getCPU().getState().pc & 0xffff;
    const r1 = st?.regs?.[1] ?? 0;
    const r0 = st?.regs?.[0] ?? 0;
    const bg = st?.regs?.[7] ?? 0;
    if (f % 10 === 0) push(`f=${f} PC=${pc.toString(16).padStart(4,'0')} R0=${r0.toString(16).padStart(2,'0')} R1=${r1.toString(16).padStart(2,'0')} R7(bg)=${bg.toString(16).padStart(2,'0')} display=${st?.displayEnabled}`);
  }

  const st = vdp.getState?.();
  if (st) {
    const regs = st.regs.slice(0, 11).map((v,i)=>`R${i}=${(v??0).toString(16).padStart(2,'0')}`).join(' ');
    push(`Final VDP: ${regs} display=${st.displayEnabled} border=${(st.borderColor??0).toString(16).padStart(2,'0')} vblankCount=${(st.vblankCount??0)}`);
    // Dump first 16 CRAM entries
    const cram = vdp.getCRAM ? Array.from(vdp.getCRAM()).slice(0,16) : (st.cram??[]).slice(0,16);
    push(`CRAM[0..15]=${cram.map(x=>x.toString(16).padStart(2,'0')).join(' ')}`);
    // Snapshot a few VRAM hot spots
    const vram = vdp.getVRAM ? Array.from(vdp.getVRAM()) : st.vram;
    const dump = (addr: number, len: number) => vram.slice(addr, addr+len).map(x=>x.toString(16).padStart(2,'0')).join(' ');
    push(`NameTable@R2 base=${(((st.regs[2]??0)>>1)&7).toString(16)} sample=${dump((((st.regs[2]??0)>>1)&7)<<11, 32)}`);
    const sprAttrBase = ((st.regs[5]??0)&0x7e)<<7;
    push(`SpriteAttr@${sprAttrBase.toString(16)} sample=${dump(sprAttrBase, 16)}`);
  }

  writeFileSync('./traces/wb_120_vdp_state.log', logs.join('\n'));
  console.log('Wrote ./traces/wb_120_vdp_state.log');
};

main();
