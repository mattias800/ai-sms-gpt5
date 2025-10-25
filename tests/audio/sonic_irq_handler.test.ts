import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic IRQ handler analysis', () => {
  it('examines IRQ handler at 0x0038', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const bus = m.getBus();

    console.log(`[irq_handler] Interrupt handler code at 0x0038 (IM1 mode):`);
    for (let addr = 0x0038; addr < 0x0050; addr++) {
      const byte = bus.read8(addr) & 0xff;
      console.log(`  0x${addr.toString(16).padStart(4,'0')}: 0x${byte.toString(16).padStart(2,'0')}`);
    }

    console.log(`\n[irq_handler] Common opcodes:`);
    console.log(`  0xC9 = RET`);
    console.log(`  0xED = ED prefix (RETI, etc)`);
    console.log(`  0xFD = IY prefix`);
    console.log(`\n[irq_handler] If handler starts with RET (0xC9), it does nothing!`);
    console.log(`  If handler ends immediately, flag at 0xD200 will never be set`);
  }, 120000);
});
