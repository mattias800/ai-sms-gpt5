import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = './sonic.sms';
const rom = new Uint8Array(readFileSync(romPath));
const cart: Cartridge = { rom };

const traces: string[] = [];
let traceCount = 0;

const m = createMachine({
  cart,
  wait: undefined,
  bus: { allowCartRam: false },
  fastBlocks: true,
  trace: {
    onTrace: (ev): void => {
      const pc = (ev.pcBefore ?? 0) & 0xffff;
      traceCount++;

      // Record every instruction around the LDIR
      if (pc >= 0x02a0 && pc <= 0x02b0) {
        const disasm = ev.text ?? `[no disasm]`;
        const info = `PC=${pc.toString(16).padStart(4, '0')} op=${ev.opcode?.toString(16).padStart(2, '0')} cycles=${ev.cycles} text='${disasm}'`;
        traces.push(info);
        console.log(info);
      }

      // Check for specific stuck pattern
      if (pc === 0x02a9 && traceCount > 100) {
        console.log('\nStuck at LDIR (0x02A9) - dumping CPU state:');
        const cpu = m.getCPU();
        const state = cpu.getState();
        console.log(`BC=${((state.b << 8) | state.c).toString(16).padStart(4, '0')}`);
        console.log(`HL=${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`);
        console.log(`DE=${((state.d << 8) | state.e).toString(16).padStart(4, '0')}`);
        console.log(`SP=${state.sp.toString(16).padStart(4, '0')}`);
        console.log(`PC=${state.pc.toString(16).padStart(4, '0')}`);

        // Check what's at the next few bytes
        const bus = m.getBus();
        console.log('\nBytes at PC and beyond:');
        for (let i = 0; i < 8; i++) {
          const addr = (0x02a9 + i) & 0xffff;
          const byte = bus.read8(addr);
          console.log(`  [${addr.toString(16).padStart(4, '0')}] = ${byte.toString(16).padStart(2, '0')}`);
        }

        process.exit(1);
      }
    },
    traceDisasm: true,
    traceRegs: false,
  },
});

console.log('Running Sonic to test LDIR with BC=0...\n');

// Run until we hit the problematic area or timeout
const maxCycles = 10000000;
m.runCycles(maxCycles);

console.log(`\nRan ${maxCycles} cycles, ${traceCount} instructions traced`);
console.log('Last traces around LDIR area:');
traces.slice(-10).forEach((t: any) => console.log(t));
