import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

let traceBuffer: string[] = [];
let inLoop = false;
let ldirCount = 0;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;

      // Start tracking from 0x0284
      if (pc === 0x0284) {
        inLoop = true;
        console.log('\n=== Starting trace from 0x0284 ===');
        traceBuffer = [];
      }

      if (inLoop) {
        const info = `0x${pc.toString(16).padStart(4, '0')}: ${ev.text ?? '[no disasm]'}`;
        traceBuffer.push(info);
        console.log(info);

        // Track LDIR executions
        if (pc === 0x02a9) {
          ldirCount++;
          const cpu = m.getCPU();
          const state = cpu.getState();
          const bc = (state.b << 8) | state.c;
          console.log(`  >> LDIR #${ldirCount} with BC=${bc.toString(16).padStart(4, '0')}`);

          if (ldirCount >= 2) {
            console.log('\n=== Loop detected ===');
            process.exit(0);
          }
        }

        // Stop if we get too many instructions
        if (traceBuffer.length > 50) {
          console.log('\n=== Too many instructions, stopping ===');
          process.exit(0);
        }
      }
    },
    traceDisasm: true,
    traceRegs: false,
  },
});

console.log('Tracing full initialization loop...');

// Run for a while
const maxCycles = 50000000;
m.runCycles(maxCycles);
