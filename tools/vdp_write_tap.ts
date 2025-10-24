import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romPath = process.env.SMS_ROM || 'game.sms';
const steps = parseInt(process.env.STEPS || '120000', 10) | 0;
const cart: Cartridge = { rom: readFileSync(romPath) };

const ringSize = parseInt(process.env.RING || '64', 10) | 0;

type MemRead = { pc: number; addr: number; val: number };
const ring: MemRead[] = new Array(ringSize);
let rIdx = 0;
let filled = false;

const mach = createMachine({
  cart,
  cpuDebugHooks: {
    onIOWrite: (port, val, pc): void => {
      const p = port & 0xff;
      const v = val & 0xff;
      if (p === 0xbe) {
        if (v !== 0) {
          console.log(`VDP DATA non-zero OUT: val=0x${v.toString(16).toUpperCase().padStart(2,'0')} @PC=0x${pc.toString(16).toUpperCase().padStart(4,'0')}`);
          dumpRing();
          process.exit(0);
        }
      }
      if (p === 0x3e) {
        console.log(`memctl 0x3E <= 0x${v.toString(16).toUpperCase().padStart(2,'0')} @PC=0x${pc.toString(16).toUpperCase().padStart(4,'0')}`);
      }
    },
  },
});

const bus = mach.getBus();
const cpu = mach.getCPU();

// Monkey-patch bus.read8 to capture memory reads
const origRead8 = bus.read8.bind(bus);
(bus as any).read8 = (addr: number): number => {
  const a = addr & 0xffff;
  const val = origRead8(addr) & 0xff;
  const pc = cpu.getState().pc & 0xffff;
  ring[rIdx] = { pc, addr: a, val };
  rIdx = (rIdx + 1) % ringSize;
  if (rIdx === 0) filled = true;
  return val;
};

function dumpRing(): void {
  console.log('--- last mem reads ---');
  const total = filled ? ringSize : rIdx;
  for (let i = 0; i < total; i++) {
    const j = (rIdx - total + i + ringSize) % ringSize;
    const r = ring[j]!;
    console.log(`#${i} PC=0x${r.pc.toString(16).toUpperCase().padStart(4,'0')} A=0x${r.addr.toString(16).toUpperCase().padStart(4,'0')} V=0x${r.val.toString(16).toUpperCase().padStart(2,'0')}`);
  }
}

for (let i = 0; i < steps; i++) {
  mach.getCPU().stepOne();
}

console.log('No non-zero VDP data writes observed. Dumping last ring from final state.');
dumpRing();

