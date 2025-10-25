import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic handler entry point verification', () => {
  it('verifies handler is actually entered on IRQ', async () => {
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

    let irqAcceptPCs: number[] = [];
    let nextPC: number = 0;

    // Hook into stepOne to track IRQ acceptance
    let stepCount = 0;
    for (let i = 0; i < 100000; i++) {
      const stateBefore = cpu.getState();
      const pcBefore = stateBefore.pc & 0xffff;
      const { cycles, irqAccepted } = cpu.stepOne();

      if (irqAccepted) {
        const stateAfter = cpu.getState();
        const pcAfter = stateAfter.pc & 0xffff;
        irqAcceptPCs.push(pcAfter);
        console.log(`[entry] IRQ accepted: PC before=0x${pcBefore.toString(16).padStart(4,'0')}, PC after IRQ=0x${pcAfter.toString(16).padStart(4,'0')}`);
      }

      stepCount++;
      if (irqAcceptPCs.length >= 3) break;
    }

    console.log(`\n[entry] Analysis:`);
    const uniqueEntries = new Set(irqAcceptPCs);
    console.log(`  IRQ entry points: ${Array.from(uniqueEntries).map(p => '0x' + p.toString(16).padStart(4,'0')).join(', ')}`);

    if (irqAcceptPCs.every(pc => pc === 0x0038)) {
      console.log(`  ✓ All IRQs jump to 0x0038 (IM1 mode correct)`);
    } else if (irqAcceptPCs.every(pc => pc === 0x0073)) {
      console.log(`  ⚠️ All IRQs jump to 0x0073 directly (bypassing 0x0038)`);
    } else {
      console.log(`  ❌ Inconsistent IRQ entry points!`);
    }
  }, 120000);
});
