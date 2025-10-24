import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = process.env.SMS_ROM || 'game.sms';
const frames = parseInt(process.env.FRAMES || '3', 10) | 0;
const verbose = (process.env.VERBOSE || '1') !== '0';

const cart: Cartridge = { rom: readFileSync(romPath) };
const mach = createMachine({ cart });

const vdp = mach.getVDP();
const bus = mach.getBus();

const cpl = vdp.getState!().cyclesPerLine | 0;
const lpf = vdp.getState!().linesPerFrame | 0;
const cpf = cpl * lpf;

// Run frames
for (let f = 0; f < frames; f++) mach.runCycles(cpf);

// Gather stats
const dbg = mach.getDebugStats();
const v = vdp.getState!();
const hcStats = bus.getHCounterStats();

// Print summary
const out: string[] = [];
out.push('=== DIAG SUMMARY ===');
out.push(`ROM: ${romPath}`);
out.push(`Frames: ${frames}, Cycles/frame=${cpf}`);
out.push('--- CPU ---');
out.push(`PC=0x${dbg.pc.toString(16).toUpperCase().padStart(4,'0')} halted=${dbg.halted} IM=${dbg.im} IFF1=${dbg.iff1?1:0} IFF2=${dbg.iff2?1:0}`);
out.push(`IRQ accepts=${dbg.irqAccepted} EI=${dbg.eiCount} (last at 0x${dbg.lastEiPc.toString(16).toUpperCase().padStart(4,'0')}) DI=${dbg.diCount} (last at 0x${dbg.lastDiPc.toString(16).toUpperCase().padStart(4,'0')})`);
out.push(`IFF changes=${dbg.iffChangeCount} last=${dbg.lastIffReason} @0x${dbg.lastIffPc.toString(16).toUpperCase().padStart(4,'0')}`);
out.push(`Last IRQ accept PC=0x${dbg.lastIrqAcceptPc.toString(16).toUpperCase().padStart(4,'0')}`);
out.push('--- BUS/MEM ---');
out.push(`MemControl(0x3E)=0x${bus.getMemControl().toString(16).toUpperCase().padStart(2,'0')} IOControl(0x3F)=0x${bus.getIOControl().toString(16).toUpperCase().padStart(2,'0')}`);
out.push(`BIOS overlay active=${bus.getBiosEnabled()}`);
out.push(`ROM banks: slot0=${bus.getROMBank(0)} slot1=${bus.getROMBank(1)} slot2=${bus.getROMBank(2)}`);
out.push('--- VDP ---');
out.push(`line=${v.line} vblankCount=${v.vblankCount} statusReads=${v.statusReadCount} irqAssertCount=${v.irqAssertCount}`);
out.push(`cyclesPerLine=${v.cyclesPerLine} linesPerFrame=${v.linesPerFrame}`);
if (verbose) {
  const top = hcStats.top.map(t=>`${t.value.toString(16).toUpperCase().padStart(2,'0')}:${t.count}`).join(', ');
  out.push(`HCounter reads total=${hcStats.total} top=${top}`);
}

console.log(out.join('\n'));

