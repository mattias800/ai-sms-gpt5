import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

let loopCount = 0;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;

      // Track when we're about to execute LDIR (after BC is loaded)
      if (pc === 0x02a9) {
        loopCount++;
        const cpu = m.getCPU();
        const state = cpu.getState();
        const de = (state.d << 8) | state.e;
        const bc = (state.b << 8) | state.c;
        const hl = (state.h << 8) | state.l;

        console.log(`Loop ${loopCount}: About to LDIR`);
        console.log(
          `  HL=${hl.toString(16).padStart(4, '0')} DE=${de.toString(16).padStart(4, '0')} BC=${bc.toString(16).padStart(4, '0')}`
        );

        if (bc === 0) {
          console.log('  WARNING: BC=0, LDIR will do nothing!');
        }

        // Stop after seeing the pattern
        if (loopCount > 5) {
          console.log('\nPattern is clear - infinite loop');
          process.exit(0);
        }
      }
    },
    traceDisasm: false,
    traceRegs: false,
  },
});

console.log('Tracing LDIR execution pattern...\n');

// Run for a while
const maxCycles = 50000000;
m.runCycles(maxCycles);
