import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import { readFileSync } from 'fs';

// Simple VDP status behavior check:
// - Enable display and VBlank IRQ in R1
// - Run some cycles until VBlank should occur
// - Confirm vdp.hasIRQ() rises
// - Perform IN A,($BF) (status read) and check that hasIRQ() falls and status VBlank bit clears

const ROM_DUMMY = new Uint8Array(0x4000); // 16KB dummy
const cart: Cartridge = { rom: ROM_DUMMY };

const run = (): number => {
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();
  const vdp: any = m.getVDP();
  const bus: any = m.getBus();

  // Helper: OUT (port),A
  const out = (port: number, a: number): void => {
    const s = cpu.getState(); s.a = a & 0xff; cpu.setState(s);
    bus.writeIO8(port & 0xff, a & 0xff);
  };
  // Helper: IN A,(port)
  const inPort = (port: number): number => {
    const v = bus.readIO8(port & 0xff) & 0xff;
    const s = cpu.getState(); s.a = v; cpu.setState(s);
    return v;
  };

  // Enable display and VBlank IRQ: write R1 via VDP control port
  // VDP control protocol: write low byte, then high byte with register index
  const writeVDPReg = (idx: number, val: number): void => {
    out(0xBF, val & 0xff);
    out(0xBF, (0x80 | (idx & 0x0f)) & 0xff);
  };

  // Set R1: bit6 Display=1, bit5 VBlankIRQ=1 -> 0x60
  writeVDPReg(1, 0x60);

  // Run for ~2 frames
  const cyclesPerFrame = 59736;
  m.runCycles(cyclesPerFrame * 2);

  // Expect IRQ asserted
  const hasBefore = vdp.hasIRQ?.() ?? false;

  // Read status (IN A,($BF)) should clear VBlank flag and drop IRQ
  const status = inPort(0xBF) & 0xff;
  const hasAfter = vdp.hasIRQ?.() ?? false;

  const vblankBitBefore = hasBefore ? 1 : 0; // proxy
  const vblankBitInStatus = (status & 0x80) !== 0 ? 1 : 0;

  const ok = hasBefore && vblankBitInStatus === 1 && !hasAfter;
  console.log(`VDP IRQ before=${hasBefore?1:0} status=${status.toString(16).padStart(2,'0')} after=${hasAfter?1:0} => ${ok ? 'OK' : 'FAIL'}`);
  return ok ? 0 : 1;
};

process.exit(run());

