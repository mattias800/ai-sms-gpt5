import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

let djnzCount = 0;
let captureNext = false;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;
      const disasm = ev.text ?? '';

      // Count DJNZ at 0x02C0
      if (pc === 0x02c0) {
        djnzCount++;
        const cpu = m.getCPU();
        const state = cpu.getState();
        const b = state.b & 0xff;
        console.log(`DJNZ at 0x02C0, iteration ${djnzCount}, B=${b}`);

        if (b === 1) {
          // Last iteration
          console.log('  This is the last DJNZ iteration, B will become 0');
          captureNext = true;
        }
      }

      // Capture what happens after DJNZ completes
      if (captureNext && pc !== 0x02c0) {
        console.log(
          `\nAfter DJNZ loop completes, execution continues at: 0x${pc.toString(16).padStart(4, '0')}: ${disasm}`
        );
        captureNext = false;

        // Capture next 20 instructions
        const count = 0;
        const originalTrace = m.getCPU().stepOne;
        const capturing = true;

        // Continue tracing
        console.log('\nNext instructions:');
      }

      if (pc > 0x02c0 && pc < 0x0300) {
        console.log(`0x${pc.toString(16).padStart(4, '0')}: ${disasm}`);
      }
    },
    traceDisasm: true,
    traceRegs: false,
  },
});

console.log('Tracing after DJNZ loop completion...\n');

// Run for a while
const maxCycles = 5000000;
m.runCycles(maxCycles);
