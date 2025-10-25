import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic 0xD200 write instrumentation', () => {
  it('traces every write to address 0xD200', async () => {
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

    let d200Writes: Array<{ pc: number; val: number; beforeVal: number }> = [];
    const originalWrite8 = bus.write8.bind(bus);

    bus.write8 = function(addr: number, val: number) {
      if (addr === 0xD200) {
        const state = cpu.getState();
        const pc = state.pc & 0xffff;
        const beforeVal = this.read8?.(0xD200) ?? 0;
        d200Writes.push({ pc, val, beforeVal });
        console.log(`[d200] Write from PC=0x${pc.toString(16).padStart(4,'0')}: [0xD200] = 0x${val.toString(16).padStart(2,'0')}`);
      }
      return originalWrite8(addr, val);
    };

    // Run for enough time to see writes
    let stepCount = 0;
    for (let i = 0; i < 100000 && d200Writes.length < 10; i++) {
      const { cycles } = cpu.stepOne();
      stepCount++;
    }

    console.log(`\n[d200] Summary after ${stepCount} steps:`);
    if (d200Writes.length === 0) {
      console.log(`  ❌ NO writes to 0xD200`);
      console.log(`  This confirms the handler is not setting the flag`);
    } else {
      console.log(`  ✓ Found ${d200Writes.length} write(s) to 0xD200`);
      for (const w of d200Writes) {
        console.log(`    PC=0x${w.pc.toString(16).padStart(4,'0')}: wrote 0x${w.val.toString(16).padStart(2,'0')}`);
      }
    }
  }, 120000);
});
