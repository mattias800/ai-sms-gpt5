import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

let count = 0;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;

      // Check BC before and after the LD BC instruction at 0x02A5
      if (pc === 0x02a5) {
        const cpu = m.getCPU();
        const stateBefore = cpu.getState();
        const bcBefore = (stateBefore.b << 8) | stateBefore.c;
        console.log(`Before LD BC,1FEF: BC=${bcBefore.toString(16).padStart(4, '0')}`);
      }

      if (pc === 0x02a8) {
        // Next instruction after LD BC,1FEF
        const cpu = m.getCPU();
        const state = cpu.getState();
        const bc = (state.b << 8) | state.c;
        console.log(`After LD BC,1FEF: BC=${bc.toString(16).padStart(4, '0')}`);

        // Check the actual bytes in ROM at 0x02A5
        const bus = m.getBus();
        console.log(
          `ROM bytes at 0x02A5: ${bus.read8(0x02a5).toString(16)} ${bus.read8(0x02a6).toString(16)} ${bus.read8(0x02a7).toString(16)}`
        );
        console.log(`  Opcode 0x01 = LD BC,nn`);
        console.log(`  Expected: 01 EF 1F for LD BC,1FEF\n`);

        count++;
        if (count >= 3) {
          process.exit(0);
        }
      }
    },
    traceDisasm: false,
    traceRegs: false,
  },
});

console.log('Checking LD BC instruction execution...\n');

// Run for a while
const maxCycles = 10000000;
m.runCycles(maxCycles);
