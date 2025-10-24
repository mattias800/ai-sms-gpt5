import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

// Log early IO writes to 0x3E/0x3F and 0xBF/0xBE, plus mapper regs 0xFFFC-0xFFFF
// Also sample a few ROM reads to confirm non-zero data

const romPath = process.env.SMS_ROM || 'game.sms';
const steps = parseInt(process.env.STEPS || '30000', 10) | 0;
const cart: Cartridge = { rom: readFileSync(romPath) };

const mach = createMachine({ cart });
const bus = mach.getBus();
const cpu = mach.getCPU();

let ioEvents = 0;
const MAX_EVENTS = 200;

// Monkey-patch bus writeIO8 and write8 to log control writes
const origWriteIO8 = bus.writeIO8.bind(bus);
(bus as any).writeIO8 = (port: number, val: number): void => {
  const p = port & 0xff;
  if ((p === 0x3e || p === 0x3f || p === 0xbe || p === 0xbf) && ioEvents < MAX_EVENTS) {
    console.log(`io: OUT ${p.toString(16).toUpperCase().padStart(2,'0')} <= ${val.toString(16).toUpperCase().padStart(2,'0')} @PC=0x${cpu.getState().pc.toString(16).toUpperCase().padStart(4,'0')}`);
    ioEvents++;
  }
  return origWriteIO8(port, val);
};
const origWrite8 = bus.write8.bind(bus);
(bus as any).write8 = (addr: number, val: number): void => {
  const a = addr & 0xffff;
  if (a >= 0xfffc && a <= 0xffff && ioEvents < MAX_EVENTS) {
    console.log(`mem: OUT ${a.toString(16).toUpperCase().padStart(4,'0')} <= ${val.toString(16).toUpperCase().padStart(2,'0')} @PC=0x${cpu.getState().pc.toString(16).toUpperCase().padStart(4,'0')}`);
    ioEvents++;
  }
  return origWrite8(addr, val);
};

// Step a fixed number of CPU instructions (not cycles) to catch init writes quickly
for (let i = 0; i < steps; i++) {
  mach.getCPU().stepOne();
}

// Sample first bytes of ROM to confirm data is non-zero
const rom = cart.rom;
const sample = Array.from(rom.subarray(0, 64)).map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' ');
console.log('ROM[0..63]:', sample);

