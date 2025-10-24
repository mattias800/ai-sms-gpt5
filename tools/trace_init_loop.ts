import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

let loopCount = 0;
let lastDE = 0;
let lastBC = 0;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;

      // Track when we hit the start of the loop
      if (pc === 0x02a2) {
        loopCount++;
        const cpu = m.getCPU();
        const state = cpu.getState();
        const de = (state.d << 8) | state.e;
        const bc = (state.b << 8) | state.c;

        console.log(`Loop ${loopCount}: DE=${de.toString(16).padStart(4, '0')} BC=${bc.toString(16).padStart(4, '0')}`);

        // After the loop loads new values
        if (loopCount > 1) {
          // Check what DE was set to after previous LDIR
          console.log(`  Previous loop ended with DE=${lastDE.toString(16).padStart(4, '0')}`);
        }

        // Stop after a few iterations to see the pattern
        if (loopCount > 10) {
          console.log('\nStopping after 10 loops to analyze pattern');
          process.exit(0);
        }
      }

      // Track the DE value set after LDIR
      if (pc === 0x02ad) {
        const cpu = m.getCPU();
        const state = cpu.getState();
        lastDE = (state.d << 8) | state.e;
        lastBC = (state.b << 8) | state.c;
      }
    },
    traceDisasm: false,
    traceRegs: false,
  },
});

console.log('Tracing Sonic initialization loop...\n');

// Run for a while
const maxCycles = 50000000;
m.runCycles(maxCycles);

console.log(`\nCompleted ${maxCycles} cycles, saw ${loopCount} loops`);
