import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic actual handler at 0x0073', () => {
  it('examines handler code', async () => {
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

    console.log(`[handler] Actual IRQ handler code at 0x0073:`);
    for (let addr = 0x0073; addr < 0x0095; addr++) {
      const byte = bus.read8(addr) & 0xff;
      console.log(`  0x${addr.toString(16).padStart(4,'0')}: 0x${byte.toString(16).padStart(2,'0')}`);
    }

    console.log(`\n[handler] Expected pattern for setting a flag:`);
    console.log(`  FD CB 00 C6 = SET 0, (IY+0)  - Set bit 0 of [IY]`);
    console.log(`  ED 4D = RETI - Return from interrupt`);
    console.log(`\n[handler] Or it could read/write PSG and set a variable`);
  }, 120000);
});
