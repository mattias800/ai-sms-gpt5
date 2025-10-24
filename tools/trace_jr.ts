import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

let seenJR = false;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;

      // When we hit the JR instruction at 0x02B0
      if (pc === 0x02b0) {
        console.log(`Executing JR at 0x02B0`);
        const bus = m.getBus();
        const opcode = bus.read8(0x02b0);
        const offset = bus.read8(0x02b1);
        console.log(`  Opcode: 0x${opcode.toString(16)} (should be 0x18 for JR)`);
        console.log(`  Offset byte: 0x${offset.toString(16)}`);
        const signedOffset = offset >= 128 ? offset - 256 : offset;
        console.log(`  Signed offset: ${signedOffset}`);
        const expectedTarget = 0x02b2 + signedOffset;
        console.log(`  Expected jump target: 0x${expectedTarget.toString(16).padStart(4, '0')}`);
        seenJR = true;
      }

      // See where we actually go after the JR
      if (seenJR && pc !== 0x02b0 && pc !== 0x02b1) {
        console.log(`  Actually jumped to: 0x${pc.toString(16).padStart(4, '0')}\n`);
        seenJR = false;
        process.exit(0);
      }
    },
    traceDisasm: false,
    traceRegs: false,
  },
});

console.log('Tracing JR instruction at 0x02B0...\n');

// Run for a while
const maxCycles = 10000000;
m.runCycles(maxCycles);
