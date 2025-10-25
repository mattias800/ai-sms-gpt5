import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic polling loop address trace', () => {
  it('checks exact address being tested in polling loop', async () => {
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

    let loopReads: Array<{ pc: number; iy: number; addr: number; val: number; zflag: number }> = [];

    const originalRead8 = bus.read8.bind(bus);
    bus.read8 = function(addr: number) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      // Only trace reads from the tight loop (0x031C, 0x0320 area)
      if ((pc === 0x031C || pc === 0x0320 || pc === 0x031F) && addr >= 0xD000 && addr <= 0xD300) {
        const val = originalRead8(addr);
        const iy = state.iy & 0xffff;
        loopReads.push({ pc, iy, addr, val, zflag: (state.f & 0x40) >> 6 });
        
        if (loopReads.length <= 5) {
          console.log(`[loop_addr] PC=0x${pc.toString(16).padStart(4,'0')}, IY=0x${iy.toString(16).padStart(4,'0')}, read [0x${addr.toString(16).padStart(4,'0')}]=0x${val.toString(16).padStart(2,'0')}`);
        }
      }

      return originalRead8(addr);
    };

    // Run to collect samples
    for (let i = 0; i < 200000 && loopReads.length < 10; i++) {
      const { cycles } = cpu.stepOne();
    }

    if (loopReads.length > 0) {
      console.log(`\n[loop_addr] Summary of ${loopReads.length} reads:`);
      const uniqueAddrs = new Set(loopReads.map(r => r.addr));
      console.log(`  Addresses read: ${Array.from(uniqueAddrs).map(a => '0x' + a.toString(16).padStart(4,'0')).join(', ')}`);
      
      const addr = loopReads[0].addr;
      const val = loopReads[0].val;
      console.log(`  Main address: 0x${addr.toString(16).padStart(4,'0')} with value 0x${val.toString(16).padStart(2,'0')}`);
      
      if (addr === 0xD200) {
        console.log(`  ✓ Loop correctly reads 0xD200`);
      } else {
        console.log(`  ⚠️ Loop reads 0x${addr.toString(16).padStart(4,'0')}, NOT 0xD200!`);
        console.log(`  This could be the problem - reading wrong address`);
      }
    }
  }, 300000);
});
