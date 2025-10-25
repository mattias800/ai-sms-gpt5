import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic loop IRQ monitor', () => {
  it('checks IRQ acceptance while stuck in loop', async () => {
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

    let irqAcceptedCount = 0;
    let loopIterations = 0;
    let otherInstructions = 0;

    // Run 10k CPU instructions while monitoring IRQ acceptance
    for (let i = 0; i < 10000; i++) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      const { cycles, irqAccepted } = cpu.stepOne();

      if (irqAccepted) {
        irqAcceptedCount++;
      }

      if (pc === 0x031C || pc === 0x0320) {
        loopIterations++;
      } else {
        otherInstructions++;
      }
    }

    const vdpState = m.getVDP().getState?.();

    console.log(`[loop_irq] Over 10,000 instructions:`);
    console.log(`  Loop iterations (0x031C/0x0320): ${loopIterations}`);
    console.log(`  Other instructions: ${otherInstructions}`);
    console.log(`  IRQs accepted: ${irqAcceptedCount}`);
    console.log(`  IFF1 enabled: ${cpu.getState().iff1}`);
    console.log(`  VDP VBlank count: ${vdpState?.vblankCount}`);
    console.log(`  VDP IRQ assert count: ${vdpState?.irqAssertCount}`);

    if (irqAcceptedCount === 0) {
      console.log(`\n[loop_irq] ⚠️ NO IRQs ACCEPTED while in tight loop!`);
      console.log(`  This means the interrupt handler never runs`);
      console.log(`  Therefore the flag at 0xD200 is never set`);
      console.log(`  CPU remains stuck forever in the polling loop`);
    }
  }, 120000);
});
