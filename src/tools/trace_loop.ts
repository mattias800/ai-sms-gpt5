import { readFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import { SmsBus } from '../bus/bus.js';
import type { Cartridge } from '../bus/bus.js';
import { disassembleOne } from '../cpu/z80/disasm.js';

async function main(): Promise<void> {
  const rom = new Uint8Array(readFileSync('./sonic.sms'));
  const cart: Cartridge = { rom };
  
  let lastPC = 0;
  let step = 0;
  const pcHistory: number[] = [];
  const maxHistory = 100;
  
  const m = createMachine({
    cart,
    fastBlocks: true,
    trace: {
      onTrace: (ev): void => {
        const pc = (ev.pcBefore ?? 0) & 0xffff;
        step++;
        
        // Add to history
        pcHistory.push(pc);
        if (pcHistory.length > maxHistory) {
          pcHistory.shift();
        }
        
        // Stop after a reasonable number of steps to see the pattern
        if (step >= 100000) {
          console.log('\nReached 100,000 steps. Last 100 PC values:');
          
          // Count unique PCs and their frequency
          const pcCounts = new Map<number, number>();
          for (const p of pcHistory) {
            pcCounts.set(p, (pcCounts.get(p) ?? 0) + 1);
          }
          
          // Sort by frequency
          const sorted = Array.from(pcCounts.entries())
            .sort((a, b) => b[1] - a[1]);
          
          console.log('\nMost frequent PCs:');
          for (const [pc, count] of sorted.slice(0, 10)) {
            const bus = m.getBus();
            const bytes: number[] = [];
            for (let i = 0; i < 4; i++) {
              bytes.push(bus.read8(pc + i));
            }
            const readFn = (addr: number): number => bytes[addr - pc] ?? 0;
            const dis = disassembleOne(readFn, pc);
            console.log(`  0x${pc.toString(16).padStart(4, '0')}: ${count} times - ${dis.text}`);
          }
          
          console.log('\nLast PC sequence (last 20):');
          for (const p of pcHistory.slice(-20)) {
            process.stdout.write(`0x${p.toString(16).padStart(4, '0')} `);
          }
          console.log();
          
          // Show what's at 0x028b to 0x02b0
          console.log('\nCode from 0x028b to 0x02b0:');
          const bus = m.getBus();
          for (let addr = 0x028b; addr <= 0x02b0; addr += 1) {
            const bytes: number[] = [];
            for (let i = 0; i < 4; i++) {
              bytes.push(bus.read8(addr + i));
            }
            const readFn = (a: number): number => bytes[a - addr] ?? 0;
            const dis = disassembleOne(readFn, addr);
            console.log(`  0x${addr.toString(16).padStart(4, '0')}: ${dis.text.padEnd(20)} ; bytes: ${bytes.slice(0, dis.length).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            addr += dis.length - 1;
          }
          
          // Check bank registers
          console.log('\nBank registers:');
          const bankRegs = (bus as any).bankRegs;
          if (bankRegs) {
            console.log(`  Bank 0: 0x${bankRegs[0]?.toString(16).padStart(2, '0') ?? '??'}`);
            console.log(`  Bank 1: 0x${bankRegs[1]?.toString(16).padStart(2, '0') ?? '??'}`);
            console.log(`  Bank 2: 0x${bankRegs[2]?.toString(16).padStart(2, '0') ?? '??'}`);
          }
          
          process.exit(0);
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
      } else if (lastPC === 0x4003 || lastPC === 0x4005) {
        return hcReads % 2 === 0 ? 0x10 : 0xb0;
      }
    }
    return origReadIO8(p);
  };

  const vdp = m.getVDP();
  const st0 = vdp.getState ? vdp.getState() : undefined;
  const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
  
  console.log('Tracing execution pattern...\n');
  
  // Run until we hit the step limit
  while (step < 100000) {
    m.runCycles(100);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
