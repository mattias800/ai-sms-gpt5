#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'node:fs';
import { createMachine } from '../src/machine/machine.js';

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
const hex4 = (n: number) => n.toString(16).padStart(4, '0');

const main = () => {
  const rom = new Uint8Array(readFileSync('./wonderboy5.sms'));
  const bios = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
  const m = createMachine({ cart: { rom }, useManualInit: false, bus: { bios } });

  const vdp = m.getVDP();
  const cpu = m.getCPU();
  const st0 = vdp.getState?.();
  const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
  let frame = 0;

  const logs: string[] = [];
  const log = (s: string) => { logs.push(s); };

  // Track last-seen values to report changes
  let lastR7 = vdp.getState?.()?.regs?.[7] ?? 0;
  let lastR2 = vdp.getState?.()?.regs?.[2] ?? 0;
  let lastDisplay = vdp.getState?.()?.displayEnabled ?? false;

  // Wrap VDP writePort to log writes
  const origWrite = vdp.writePort.bind(vdp);
  vdp.writePort = (port: number, val: number) => {
    const before = vdp.getState?.();
    const pc = cpu.getState().pc & 0xffff;
    origWrite(port, val);
    const after = vdp.getState?.();

    if (port === 0xBF || port === 0xBE) {
      const curAddr = after?.curAddr ?? -1;
      const curCode = after?.curCode ?? -1;
      const r7 = after?.regs?.[7] ?? 0;
      const r2 = after?.regs?.[2] ?? 0;
      const disp = after?.displayEnabled ?? false;
      // Summarize
      log(`f=${frame} PC=${hex4(pc)} port=${hex2(port)} val=${hex2(val)} addr=${curAddr>=0?hex4(curAddr):'----'} code=${hex2((curCode??0)&0xff)} R7=${hex2(r7)} R2=${hex2(r2)} disp=${disp}`);
      // Report R7/R2/display changes
      if (r7 !== lastR7) { log(`  R7 change: ${hex2(lastR7)} -> ${hex2(r7)} (frame=${frame})`); lastR7 = r7; }
      if (r2 !== lastR2) { log(`  R2 change: ${hex2(lastR2)} -> ${hex2(r2)} (frame=${frame})`); lastR2 = r2; }
      if (disp !== lastDisplay) { log(`  Display change: ${lastDisplay?'ON':'OFF'} -> ${disp?'ON':'OFF'} (frame=${frame})`); lastDisplay = disp; }
      // If VRAM write into name table region (R2-based), highlight
      const ntBase = (((after?.regs?.[2] ?? 0) >> 1) & 7) << 11;
      if (port === 0xBE && curAddr >= ntBase && curAddr < ntBase + 0x400) {
        log(`  VRAM write to Nametable: addr=${hex4(curAddr)} base=${hex4(ntBase)} val=${hex2(val)}`);
      }
    }
  };

  // Run for 120 frames
  for (frame = 1; frame <= 120; frame++) {
    m.runCycles(cyclesPerFrame);
    if (frame % 10 === 0) {
      const st = vdp.getState?.();
      log(`tick f=${frame} PC=${hex4(cpu.getState().pc & 0xffff)} R1=${hex2(st?.regs?.[1]??0)} R7=${hex2(st?.regs?.[7]??0)} disp=${st?.displayEnabled}`);
    }
  }

  writeFileSync('./traces/wb_vdp_writes.log', logs.join('\n'));
  console.log('Wrote ./traces/wb_vdp_writes.log');
};

main();
