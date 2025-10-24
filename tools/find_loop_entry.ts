import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

const instructionLog: string[] = [];
let capturing = false;
let captureCount = 0;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;
      const disasm = ev.text ?? '';

      // Start capturing when we approach the area
      if (pc >= 0x0270 && pc <= 0x02c0) {
        if (!capturing) {
          capturing = true;
          console.log('\n=== Starting capture around initialization area ===');
        }

        const entry = `0x${pc.toString(16).padStart(4, '0')}: ${disasm}`;
        instructionLog.push(entry);
        console.log(entry);

        // Look for patterns
        if (pc === 0x02b0 && disasm.includes('JR')) {
          captureCount++;
          if (captureCount >= 2) {
            console.log('\n=== Found loop pattern, analyzing... ===');

            // Dump the actual bytes from ROM
            const bus = m.getBus();
            console.log('\nROM bytes from 0x0280 to 0x02B2:');
            for (let addr = 0x0280; addr <= 0x02b2; addr++) {
              const byte = bus.read8(addr);
              if (addr % 16 === 0) {
                process.stdout.write(`\n0x${addr.toString(16).padStart(4, '0')}: `);
              }
              process.stdout.write(`${byte.toString(16).padStart(2, '0')} `);
            }
            console.log('\n');

            // Disassemble the area
            console.log('Disassembled code:');
            console.log('0x0284: 3D = DEC A');
            console.log('0x0285: 1F = RRA');
            console.log('0x0286: 17 = RLA');
            console.log('0x0287: 14 = INC D');
            console.log('0x0288: 3A 19 00 = LD A,(0019)');
            console.log('0x028B: 3E 80 = LD A,80');
            console.log('...');
            console.log('0x02B0: 18 D2 = JR -46 (to 0x0284)');

            process.exit(0);
          }
        }
      }
    },
    traceDisasm: true,
    traceRegs: false,
  },
});

console.log('Finding loop entry point...');

// Run for a while
const maxCycles = 5000000;
m.runCycles(maxCycles);
