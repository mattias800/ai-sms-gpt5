import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic tight loop analysis', () => {
  it('examines loop at 0x031C-0x0320', async () => {
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

    console.log(`[loop] Examining ROM around tight loop (0x0310-0x0330):`);
    for (let addr = 0x0310; addr < 0x0330; addr++) {
      const byte = bus.read8(addr) & 0xff;
      const isLoop = addr >= 0x031C && addr <= 0x0320;
      const mark = isLoop ? ' ← TIGHT LOOP' : '';
      console.log(`  0x${addr.toString(16).padStart(4,'0')}: 0x${byte.toString(16).padStart(2,'0')}${mark}`);
    }

    // Common opcodes in the loop
    console.log(`[loop] Opcode analysis:`);
    console.log(`  0xFD = IY-indexed prefix (FD ..)`);
    console.log(`  0x28 = JR Z,d (jump relative if zero flag set)`);
    console.log(`  0xAF = XOR A (set A=0, clear flags)`);
    
    console.log(`\n[loop] Likely pattern: waiting for a flag/memory location`);
    console.log(`  The loop repeatedly reads memory (IY-indexed) and checks a flag`);
    console.log(`  This could be waiting for VDP status, PSG ready flag, or game input`);
  }, 120000);
});
