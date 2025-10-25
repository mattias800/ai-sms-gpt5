import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic IY initialization trace', () => {
  it('tracks when IY is initialized to 0xD200', async () => {
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

    let iyChanges: Array<{ pc: number; newIY: number; cycle: number }> = [];
    let lastIY = 0;
    let cycleCount = 0;

    for (let i = 0; i < 100000; i++) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;
      const iy = state.iy & 0xffff;

      if (iy !== lastIY) {
        iyChanges.push({ pc, newIY: iy, cycle: cycleCount });
        console.log(`[iy_init] Cycle ${cycleCount}, PC=0x${pc.toString(16).padStart(4,'0')}: IY changed to 0x${iy.toString(16).padStart(4,'0')}`);
        lastIY = iy;

        if (iy === 0xD200) {
          console.log(`[iy_init] ✓ IY initialized to 0xD200 after ${cycleCount} cycles`);
          break;
        }
      }

      const { cycles } = cpu.stepOne();
      cycleCount += cycles;
    }

    console.log(`\n[iy_init] Summary:`);
    console.log(`  Total IY changes: ${iyChanges.length}`);
    if (iyChanges.length > 0) {
      console.log(`  First change: IY=0x${iyChanges[0].newIY.toString(16).padStart(4,'0')} at PC=0x${iyChanges[0].pc.toString(16).padStart(4,'0')}`);
      const target = iyChanges.find(c => c.newIY === 0xD200);
      if (target) {
        console.log(`  IY=0xD200 set at: PC=0x${target.pc.toString(16).padStart(4,'0')}, cycle=${target.cycle}`);
      } else {
        console.log(`  ❌ IY never set to 0xD200`);
      }
    }
  }, 120000);
});
