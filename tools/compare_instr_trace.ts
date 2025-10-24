#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import { createZ80 } from '../src/cpu/z80/z80.js';
import { SmsBus } from '../src/bus/bus.js';
import { createVDP } from '../src/vdp/vdp.js';
import { createPSG } from '../src/psg/sn76489.js';

interface TraceOptions {
  maxSteps: number;
  tracePath: string;
}

const parseMameInstrTrace = (traceText: string, max: number): number[] => {
  const lines = traceText.split(/\r?\n/);
  const pcs: number[] = [];
  let lastPc: number | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*([0-9A-Fa-f]{4}):/);
    if (m) {
      const pc = parseInt(m[1], 16) & 0xffff;
      pcs.push(pc);
      lastPc = pc;
      if (pcs.length >= max) break;
      continue;
    }
    // Expand summary loop lines to keep instruction counts aligned with CPU stepping
    const loop = line.match(/\(loops for\s+(\d+)\s+instructions\)/i);
    if (loop) {
      const n = parseInt(loop[1], 10) | 0;
      if (lastPc !== null) {
        for (let i = 0; i < n && pcs.length < max; i++) pcs.push(lastPc);
      }
      if (pcs.length >= max) break;
      continue;
    }
    if (pcs.length >= max) break;
  }
  return pcs;
};

const main = () => {
  const opts: TraceOptions = {
    maxSteps: parseInt(process.env.MAX_STEPS ?? '20000', 10),
    tracePath: process.env.MAME_TRACE ?? './traces/sms_instr.log',
  };

  const traceText = readFileSync(opts.tracePath, 'utf-8');
  const mamePCs = parseMameInstrTrace(traceText, opts.maxSteps * 10);
  if (mamePCs.length === 0) {
    console.error(`No MAME PCs parsed from ${opts.tracePath}`);
    process.exit(2);
  }
  // Run-length encode MAME PCs to handle long runs of identical PCs (e.g., JR loops)
  const runs: { pc: number; count: number }[] = [];
  for (const pc of mamePCs) {
    if (runs.length && runs[runs.length - 1].pc === pc) runs[runs.length - 1].count++;
    else runs.push({ pc, count: 1 });
  }

  // Set up our emulator with BIOS
  const rom = new Uint8Array(readFileSync('./wonderboy5.sms'));
  const bios = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
  const vdp = createVDP();
  const psg = createPSG();
  const bus = new SmsBus({ rom }, vdp, psg, null, null, { allowCartRam: true, bios });
  const cpu = createZ80({
    bus,
    experimentalFastBlockOps: false,
    onCycle: (cycles: number) => {
      // keep devices in lockstep
      vdp.tickCycles(cycles);
      psg.tickCycles(cycles);
      if (vdp.hasIRQ()) cpu.requestIRQ();
    },
  });
  cpu.reset();

  // Align with MAME trace: MAME's first printed PC appears to start after an initial reset instruction at 0x0000.
  // Step one instruction to skip PC=0x0000 so our next pcBefore should match MAME's first line (e.g., 0x0001).
  cpu.stepOne();

  const ours: number[] = [];
  let divergedAt: number | null = null;

  // Walk through runs with a step chase
  let runIdx = 0;
  let steps = 0;
  const MAX_STEPS = opts.maxSteps;
  while (runIdx < runs.length && steps < MAX_STEPS) {
    const st = cpu.getState();
    const pcBefore = st.pc & 0xffff;
    ours.push(pcBefore);
    const run = runs[runIdx];

    if (pcBefore === run.pc) {
      // Aligned with current MAME run entry
      cpu.stepOne();
      steps++;
      run.count--;
      if (run.count <= 0) runIdx++;
      continue;
    }

    // Try small step-chase to reach run.pc (useful for JR loops where MAME stays on JR while we advance within the loop)
    const CHASE_LIMIT = 8;
    let matched = false;
    for (let k = 0; k < CHASE_LIMIT && steps < MAX_STEPS; k++) {
      cpu.stepOne();
      steps++;
      const pcNow = cpu.getState().pc & 0xffff;
      if (pcNow === run.pc) {
        matched = true;
        break;
      }
    }
    if (matched) {
      // Now consume one from the run at this PC
      run.count--;
      if (run.count <= 0) runIdx++;
      continue;
    }

    // Could not align within chase bounds -> report mismatch
    divergedAt = ours.length - 1;
    break;
  }

  if (divergedAt === null) {
    console.log(`No divergence in first ${ours.length} instructions (limited by maxSteps or trace length).`);
    process.exit(0);
  } else {
    const idx = divergedAt;
    const window = 10;
    const start = Math.max(0, idx - window);
    const end = Math.min(mamePCs.length, idx + window + 1);
    console.log(`DIVERGENCE at instruction #${idx + 1}`);
    console.log(`  MAME PC=0x${mamePCs[idx].toString(16).padStart(4,'0')}  OUR PC=0x${ours[idx].toString(16).padStart(4,'0')}`);

    console.log(`\nContext:`);
    for (let i = start; i < end; i++) {
      const tag = i === idx ? '<<' : '  ';
      const oursPc = i < ours.length ? ours[i] : -1;
      const oursStr = oursPc >= 0 ? `0x${oursPc.toString(16).padStart(4,'0')}` : '----';
      console.log(`${tag} #${i+1}  MAME=0x${mamePCs[i].toString(16).padStart(4,'0')}  OUR=${oursStr}`);
    }

    // Second pass: log detailed regs around the window to diagnose flags/flow
    console.log('\nOur register trace around divergence:');
    {
      const vdp2 = createVDP();
      const psg2 = createPSG();
      const rom2 = new Uint8Array(readFileSync('./wonderboy5.sms'));
      const bios2 = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
      const bus2 = new SmsBus({ rom: rom2 }, vdp2, psg2, null, null, { allowCartRam: true, bios: bios2 });
      const cpu2 = createZ80({
        bus: bus2,
        experimentalFastBlockOps: false,
        onCycle: (cycles: number) => {
          vdp2.tickCycles(cycles);
          psg2.tickCycles(cycles);
          if (vdp2.hasIRQ()) cpu2.requestIRQ();
        },
      });
      cpu2.reset();
      cpu2.stepOne(); // align
      for (let i = 0; i < end; i++) {
        const st2 = cpu2.getState();
        if (i >= start && i <= end) {
          const pc2 = st2.pc & 0xffff;
          const de = ((st2.d << 8) | st2.e) & 0xffff;
          const orRes = (st2.a | st2.e) & 0xff;
          const z = orRes === 0 ? 1 : 0;
          const zf = (st2.f & 0x40) ? 1 : 0;
          console.log(`#${i+1} PC=0x${pc2.toString(16).padStart(4,'0')} A=${st2.a.toString(16).padStart(2,'0')} D=${st2.d.toString(16).padStart(2,'0')} E=${st2.e.toString(16).padStart(2,'0')} B=${st2.b.toString(16).padStart(2,'0')} DE=${de.toString(16).padStart(4,'0')} F=${st2.f.toString(16).padStart(2,'0')} Zexp=${z} Zf=${zf}`);
        }
        cpu2.stepOne();
      }
    }

    // Dump CPU registers at divergence
    const st = cpu.getState();
    const regs: Record<string, unknown> = {
      pc: st.pc, sp: st.sp, a: st.a, f: st.f,
      b: st.b, c: st.c, d: st.d, e: st.e, h: st.h, l: st.l,
      ix: (st as any).ix, iy: (st as any).iy, i: (st as any).i, r: (st as any).r,
      iff1: (st as any).iff1, iff2: (st as any).iff2, im: (st as any).im, halted: (st as any).halted,
    };
    console.log('\nOur CPU state at divergence:');
    console.log(regs);

    process.exit(1);
  }
};

main();
