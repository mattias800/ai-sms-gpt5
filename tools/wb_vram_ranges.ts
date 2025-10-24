#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMachine } from '../src/machine/machine.js';
import { enableSMSInterrupts } from '../src/machine/sms_init.js';

const countNZ = (a: Uint8Array, base: number, len: number): number => {
  let n = 0; for (let i = 0; i < len; i++) if ((a[base + i] ?? 0) !== 0) n++; return n;
};

(async () => {
  const root = process.cwd();
  const romPath = process.env.WONDERBOY_SMS_ROM || join(root, 'wonderboy5.sms');
  const biosPath = process.env.SMS_BIOS_ROM || join(root, 'third_party/mame/roms/sms1/mpr-10052.rom');
  if (!existsSync(romPath)) { console.error('ROM missing'); process.exit(1); }
  const rom = new Uint8Array(readFileSync(romPath));
  const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;
  const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios } });
  enableSMSInterrupts(m.getCPU());
  const vdp = m.getVDP();
  const s0 = vdp.getState?.();
  const cpf = (s0?.cyclesPerLine ?? 228) * (s0?.linesPerFrame ?? 262);
  for (let i = 0; i < 120; i++) m.runCycles(cpf);
  const st = vdp.getState?.();
  if (!st) { console.error('no vdp'); process.exit(2); }
  const v = new Uint8Array(st.vram);
  const report = {
    regs: st.regs.slice(0, 16),
    nameBase: (((st.regs[2] ?? 0) >> 1) & 7) << 11,
    ranges: {
      'pat0-4k': countNZ(v, 0x0000, 0x1000),
      'pat4k-8k': countNZ(v, 0x1000, 0x1000),
      'pat8k-12k': countNZ(v, 0x2000, 0x1000),
      'pat12k-16k': countNZ(v, 0x3000, 0x1000),
      'name@3800': countNZ(v, 0x3800, 0x0400),
      'name@0800': countNZ(v, 0x0800, 0x0400),
      'sat@3f00': countNZ(v, 0x3f00, 0x0080),
      'satx@3f80': countNZ(v, 0x3f80, 0x0080),
    }
  };
  console.log(JSON.stringify(report, null, 2));
})();
