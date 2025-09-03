import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import { SmsBus } from '../bus/bus.js';
import type { Cartridge } from '../bus/bus.js';
import { disassembleOne } from '../cpu/z80/disasm.js';

async function main(): Promise<void> {
  const rom = new Uint8Array(readFileSync('./sonic.sms'));
  const cart: Cartridge = { rom };
  
  let lastPC = 0;
  let step = 0;
  const trace: string[] = [];
  
  const m = createMachine({
    cart,
    fastBlocks: true,
    trace: {
      onTrace: (ev): void => {
        const pc = (ev.pcBefore ?? 0) & 0xffff;
        const bus = m.getBus();
        
        // Get disassembly
        const bytes: number[] = [];
        for (let i = 0; i < 4; i++) {
          bytes.push(bus.read8(pc + i));
        }
        const readFn = (addr: number): number => bytes[addr - pc] ?? 0;
        const dis = disassembleOne(readFn, pc);
        
        const line = `${step.toString().padStart(6)}: PC=${pc.toString(16).padStart(4, '0')} ${dis.text.padEnd(20)}`;
        trace.push(line);
        
        // Key points
        if (pc === 0x028d) {
          console.log(`\nStep ${step}: Writing to 0xFFFC (enabling RAM mirror)`);
        }
        
        if (pc === 0x02b0) {
          console.log(`\nStep ${step}: At 0x02B0 (JR -46)`);
          const target = (pc + 2 - 46) & 0xFFFF;
          console.log(`  -> Should jump to 0x${target.toString(16).padStart(4, '0')}`);
        }
        
        // Check if we're executing from RAM mirror
        if (pc < 0x2000) {
          const ramByte = bus.read8(0xC000 + pc);
          const romByte = rom[pc]!;
          if (bytes[0] === ramByte && bytes[0] !== romByte) {
            console.log(`\nStep ${step}: Executing from RAM mirror at PC=0x${pc.toString(16).padStart(4, '0')}`);
          }
        }
        
        step++;
        lastPC = pc;
        
        // Stop after certain milestones
        if (step >= 100) {
          console.log(`\n=== Execution trace (last 30 instructions) ===`);
          for (const l of trace.slice(-30)) {
            console.log(l);
          }
          
          // Check VDP status
          const vdp = m.getVDP();
          const vdpState = vdp.getState ? vdp.getState() : undefined;
          console.log('\n=== VDP State ===');
          console.log(`Display enabled: ${(vdpState?.regs[1] ?? 0) & 0x40 ? 'ON' : 'OFF'}`);
          console.log(`VDP registers:`, vdpState?.regs.slice(0, 8).map(r => r.toString(16).padStart(2, '0')).join(' '));
          
          writeFileSync('trace_ram.txt', trace.join('\n'));
          console.log('\nFull trace saved to trace_ram.txt');
          process.exit(0);
        }
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

  console.log('Tracing execution with RAM mirroring...');
  
  // Run
  for (let i = 0; i < 1000; i++) {
    m.runCycles(100);
    if (step > 100) break;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
