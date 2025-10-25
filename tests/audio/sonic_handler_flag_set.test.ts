import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic handler flag modification trace', () => {
  it('traces all memory modifications to 0xD200 during handler', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();
    const bus = m.getBus();

    let inHandler = false;
    let handlerDepth = 0;
    let d200Modifications: Array<{ pc: number; before: number; after: number; write: boolean }> = [];

    // Track stack for handler exit detection
    let entryPC = 0;
    let entrySP = 0;
    let modCount = 0;

    for (let i = 0; i < 100000 && modCount < 5; i++) {
      const stateBefore = cpu.getState();
      const pcBefore = stateBefore.pc & 0xffff;
      const d200Before = bus.read8(0xD200) & 0xff;

      const { cycles, irqAccepted } = cpu.stepOne();

      const stateAfter = cpu.getState();
      const d200After = bus.read8(0xD200) & 0xff;

      // Track handler entry
      if (irqAccepted) {
        inHandler = true;
        handlerDepth = 1;
        entryPC = stateAfter.pc & 0xffff;
        entrySP = stateAfter.sp & 0xffff;
        console.log(`[handler_flag] IRQ accepted, entered at PC=0x${entryPC.toString(16).padStart(4,'0')}`);
      }

      // Track any modification to 0xD200
      if (d200Before !== d200After && inHandler) {
        d200Modifications.push({
          pc: pcBefore,
          before: d200Before,
          after: d200After,
          write: true
        });
        console.log(`[handler_flag] PC=0x${pcBefore.toString(16).padStart(4,'0')}: [0xD200] changed from 0x${d200Before.toString(16).padStart(2,'0')} to 0x${d200After.toString(16).padStart(2,'0')}`);
        modCount++;
      }

      // Detect handler exit (RET instruction, or jumped far away)
      if (inHandler && handlerDepth > 0) {
        const pcAfter = stateAfter.pc & 0xffff;
        const spAfter = stateAfter.sp & 0xffff;
        
        // If SP returned to entry or above, handler likely exited
        if (spAfter >= entrySP && pcAfter < 0x0000 || pcAfter > 0x0200) {
          console.log(`[handler_flag] Handler exited at PC=0x${pcAfter.toString(16).padStart(4,'0')}, SP=0x${spAfter.toString(16).padStart(4,'0')}`);
          inHandler = false;
        }
      }
    }

    console.log(`\n[handler_flag] Summary:`);
    if (d200Modifications.length === 0) {
      console.log(`  ❌ Handler NEVER modified 0xD200`);
      console.log(`  The polling loop waits forever because nothing sets the flag`);
    } else {
      console.log(`  ✓ Handler modified 0xD200 ${d200Modifications.length} time(s)`);
      for (const mod of d200Modifications) {
        console.log(`    PC=0x${mod.pc.toString(16).padStart(4,'0')}: 0x${mod.before.toString(16).padStart(2,'0')} → 0x${mod.after.toString(16).padStart(2,'0')}`);
      }
    }
  }, 120000);
});
