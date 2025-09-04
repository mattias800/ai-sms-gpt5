import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import { SmsBus } from '../src/bus/bus.js';
import type { Cartridge } from '../src/bus/bus.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';

async function main(): Promise<void> {
  const rom = new Uint8Array(readFileSync('./sonic.sms'));
  const cart: Cartridge = { rom };

  let lastPC = 0;
  let step = 0;
  let ramMirrorActive = false;

  const m = createMachine({
    cart,
    fastBlocks: true,
    trace: {
      onTrace: (ev): void => {
        const pc = (ev.pcBefore ?? 0) & 0xffff;
        step++;

        // Track when we write 0x80 to 0xFFFC
        if (pc === 0x028d && !ramMirrorActive) {
          console.log(`\nStep ${step}: Writing 0x80 to 0xFFFC, enabling RAM mirror`);
          ramMirrorActive = true;
        }

        // Check what happens when we jump back to 0x0284
        if (pc === 0x0284 && ramMirrorActive) {
          const bus = m.getBus();
          console.log(`\nStep ${step}: Jumped to 0x0284 with RAM mirror active`);

          // Read what's at 0x0284 now
          console.log('Memory at 0x0284 (should be RAM mirror):');
          for (let i = 0; i < 16; i++) {
            const byte = bus.read8(0x0284 + i);
            process.stdout.write(byte.toString(16).padStart(2, '0') + ' ');
          }
          console.log('\n');

          // Try to disassemble it
          const bytes: number[] = [];
          for (let i = 0; i < 4; i++) {
            bytes.push(bus.read8(0x0284 + i));
          }
          const readFn = (addr: number): number => bytes[addr - 0x0284] ?? 0;
          const dis = disassembleOne(readFn, 0x0284);
          console.log(`Disassembly: ${dis.text}`);

          // Also check RAM at 0xC284
          console.log('\nRAM at 0xC284 (source of mirror):');
          for (let i = 0; i < 16; i++) {
            const byte = bus.read8(0xc284 + i);
            process.stdout.write(byte.toString(16).padStart(2, '0') + ' ');
          }
          console.log('\n');

          // Let it run a bit more
          if (step > 100) {
            console.log('\nStopping after 100 steps with RAM mirror active');
            process.exit(0);
          }
        }

        lastPC = pc;
      },
      traceDisasm: false,
      traceRegs: false,
    },
  });

  // Help it get past HC waits
  const bus = m.getBus() as SmsBus;
  const origReadIO8 = bus.readIO8.bind(bus);
  let hcReads = 0;

  bus.readIO8 = (port: number): number => {
    const p = port & 0xff;
    if (p === 0x7e) {
      hcReads++;
      if (lastPC === 0x0003 || lastPC === 0x0005) {
        if (hcReads <= 2) return 0x00;
        return 0xb0;
      }
    }
    return origReadIO8(p);
  };

  console.log('Testing RAM mirroring when bit 7 is set in 0xFFFC...');

  // Run for a bit
  for (let i = 0; i < 1000; i++) {
    m.runCycles(1000);
    if (step > 200) break;
  }

  console.log(`\nRan ${step} steps, last PC: 0x${lastPC.toString(16).padStart(4, '0')}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
