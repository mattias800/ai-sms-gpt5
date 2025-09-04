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
  const pcHistory: number[] = [];
  let atJump = false;

  const m = createMachine({
    cart,
    fastBlocks: true,
    trace: {
      onTrace: (ev): void => {
        const pc = (ev.pcBefore ?? 0) & 0xffff;
        const bus = m.getBus();

        pcHistory.push(pc);

        // Track key locations
        if (pc === 0x02b0 && !atJump) {
          console.log(`\nStep ${step}: At 0x02B0 (JR -46)`);
          console.log('Will jump to 0x0284');
          atJump = true;
        }

        if (pc === 0x0284 && atJump) {
          console.log(`\nStep ${step}: Reached 0x0284 after jump`);

          // Show what's at 0x0284
          const bytes: number[] = [];
          for (let i = 0; i < 8; i++) {
            bytes.push(bus.read8(0x0284 + i));
          }
          console.log('Memory at 0x0284:', bytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' '));

          // Try to disassemble
          const readFn = (addr: number): number => bytes[addr - 0x0284] ?? 0;
          const dis = disassembleOne(readFn, 0x0284);
          console.log(`Instruction: ${dis.text}`);

          // Continue for a few more steps
        }

        // Check if we reach 0x02B2 (the copy loop)
        if (pc === 0x02b2) {
          console.log(`\nStep ${step}: Reached 0x02B2 (copy loop start)!`);
          console.log('The code DID jump here somehow!');
        }

        // Stop after some steps
        if (step > 50 && atJump) {
          console.log(`\nStopping after ${step} steps`);
          console.log('Recent PC history:');
          const recent = pcHistory.slice(-20);
          for (const p of recent) {
            process.stdout.write(`0x${p.toString(16).padStart(4, '0')} `);
          }
          console.log();

          // Check where we're stuck
          const lastFew = new Set(pcHistory.slice(-10));
          if (lastFew.size < 5) {
            console.log(
              '\nStuck in a loop with PCs:',
              Array.from(lastFew)
                .map((p: any) => `0x${p.toString(16).padStart(4, '0')}`)
                .join(', ')
            );
          }

          process.exit(0);
        }

        step++;
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

  console.log('Tracing actual execution flow...');

  // Run
  for (let i = 0; i < 100; i++) {
    m.runCycles(100);
    if (step > 100) break;
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
