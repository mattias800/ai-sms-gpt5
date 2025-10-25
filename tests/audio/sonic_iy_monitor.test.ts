import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic IY register monitor', () => {
  it('tracks IY value and memory it points to', async () => {
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

    let loopCount = 0;
    let iyValue = 0;

    // Run until we hit the loop a few times
    for (let i = 0; i < 50000 && loopCount < 5; i++) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      if (pc === 0x031C) {
        iyValue = state.iy & 0xffff;
        const memValue = bus.read8(iyValue) & 0xff;
        loopCount++;
        console.log(`[iy_monitor] Loop iteration ${loopCount}:`);
        console.log(`  IY = 0x${iyValue.toString(16).padStart(4,'0')}`);
        console.log(`  Memory at [IY] = 0x${memValue.toString(16).padStart(2,'0')}`);
        console.log(`  Bit 0 = ${(memValue & 1) ? 1 : 0} (waiting for this to be 1)`);
      }

      const { cycles } = cpu.stepOne();
    }

    console.log(`\n[iy_monitor] Analysis:`);
    console.log(`  IY points to: 0x${iyValue.toString(16).padStart(4,'0')}`);
    
    // Check if IY points to RAM or ROM
    if (iyValue >= 0xC000) {
      console.log(`  → Points to RAM (game data)`);
    } else if (iyValue >= 0x4000) {
      console.log(`  → Points to ROM (game code/data)`);
    } else {
      console.log(`  → Points to system/BIOS area`);
    }
    
    console.log(`\n[iy_monitor] This memory location needs bit 0 set to exit loop`);
    console.log(`  If bit 0 is always 0, the CPU is waiting for a condition that never becomes true`);
  }, 120000);
});
