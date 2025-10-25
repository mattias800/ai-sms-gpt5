import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic trace handler execution', () => {
  it('monitors execution of IRQ handler', async () => {
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

    // Simulate until we see an IRQ acceptance
    let handlerEntered = false;
    let irqStartPC = 0;
    let instructionsInHandler = 0;
    const memoryWrites: Array<{ addr: number; val: number; pc: number }> = [];

    // Setup debug hook to track memory writes
    const originalWrite8 = bus.write8;
    bus.write8 = function(addr: number, val: number) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;
      
      // Track writes around 0xD200
      if (addr >= 0xD1F0 && addr <= 0xD210) {
        memoryWrites.push({ addr, val, pc });
      }
      
      return originalWrite8.call(this, addr, val);
    };

    for (let i = 0; i < 100000; i++) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      // Detect handler entry (jump to 0x0073)
      if (pc === 0x0073 && !handlerEntered) {
        handlerEntered = true;
        irqStartPC = pc;
        console.log(`[trace] Handler entered at PC=0x0073`);
      }

      if (handlerEntered && (pc < 0x0073 || pc > 0x0150)) {
        // Handler exited
        console.log(`[trace] Handler exited at PC=0x${pc.toString(16).padStart(4,'0')}`);
        console.log(`[trace] Instructions in handler: ${instructionsInHandler}`);
        break;
      }

      if (handlerEntered) {
        instructionsInHandler++;
      }

      const { cycles } = cpu.stepOne();
    }

    console.log(`\n[trace] Memory writes around 0xD200:`);
    if (memoryWrites.length === 0) {
      console.log(`  None! The handler never writes to 0xD200`);
      console.log(`  This explains why the CPU remains stuck in the polling loop`);
    } else {
      for (const {addr, val, pc} of memoryWrites) {
        console.log(`  PC=0x${pc.toString(16).padStart(4,'0')}: [0x${addr.toString(16).padStart(4,'0')}] = 0x${val.toString(16).padStart(2,'0')}`);
      }
    }
  }, 120000);
});
