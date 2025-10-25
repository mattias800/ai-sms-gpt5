import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic flag set and loop progression', () => {
  it('checks if flag set leads to loop progression', async () => {
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

    let inLoopBefore0x1C4D = 0;
    let inLoopAfter0x1C4D = 0;
    let seenWrite = false;
    let writePC = 0;
    let pcAfterWrite = 0;

    for (let i = 0; i < 200000; i++) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      // Track if in loop before and after the write at 0x1C4D
      if (pc === 0x031C || pc === 0x0320) {
        if (!seenWrite) {
          inLoopBefore0x1C4D++;
        } else {
          inLoopAfter0x1C4D++;
        }
      }

      if (pc === 0x1C4D && !seenWrite) {
        seenWrite = true;
        writePC = pc;
        const val = bus.read8(0xD200) & 0xff;
        console.log(`[progression] Write at PC=0x${pc.toString(16).padStart(4,'0')}, 0xD200 before write: 0x${val.toString(16).padStart(2,'0')}`);
      }

      if (seenWrite && pcAfterWrite === 0) {
        // Record first PC after the write
        if (pc !== writePC) {
          pcAfterWrite = pc;
          const val = bus.read8(0xD200) & 0xff;
          console.log(`[progression] After write, next PC=0x${pc.toString(16).padStart(4,'0')}, 0xD200 after: 0x${val.toString(16).padStart(2,'0')}`);
        }
      }

      const { cycles } = cpu.stepOne();
    }

    console.log(`\n[progression] Analysis:`);
    console.log(`  Loop iterations BEFORE write at 0x1C4D: ${inLoopBefore0x1C4D}`);
    console.log(`  Loop iterations AFTER write at 0x1C4D: ${inLoopAfter0x1C4D}`);

    if (inLoopAfter0x1C4D === 0) {
      console.log(`  ✓ FLAG WORKS! Setting flag causes loop to exit`);
    } else if (inLoopAfter0x1C4D < inLoopBefore0x1C4D * 0.1) {
      console.log(`  ✓ FLAG WORKS! Loop frequency reduced significantly after flag set`);
    } else {
      console.log(`  ❌ FLAG DOESN'T WORK! Loop continues at same rate after flag set`);
    }
  }, 300000);
});
