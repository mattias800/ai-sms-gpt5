import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Trace OTIR/OUTI Instructions ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

// Track banking
const currentBanks = [0, 1, 2, 3];

const CYCLES_PER_FRAME = 59736;
let totalCycles = 0;

// Track OTIR/OUTI instructions
let otirCount = 0;
let outiCount = 0;

// Hook bus writes to detect bank switching
const originalWrite8 = bus.write8.bind(bus);
bus.write8 = function (addr: number, val: number) {
  if (addr >= 0xfffc && addr <= 0xffff) {
    const bankSlot = addr - 0xfffc;
    currentBanks[bankSlot] = val;
  }
  return originalWrite8(addr, val);
};

// Hook CPU to detect OTIR/OUTI
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const state = cpu.getState();

  // Check for block I/O instructions
  const op = bus.read8(state.pc);
  if (op === 0xed) {
    const op2 = bus.read8((state.pc + 1) & 0xffff);

    if (op2 === 0xb3) {
      // OTIR
      otirCount++;
      const hl = (state.h << 8) | state.l;
      const bc = (state.b << 8) | state.c;
      const portC = state.c;

      console.log(`\n=== OTIR #${otirCount} at cycle ${totalCycles} ===`);
      console.log(`  PC=0x${state.pc.toString(16).padStart(4, '0')}`);
      console.log(`  Source: HL=0x${hl.toString(16).padStart(4, '0')} (${bc} bytes)`);
      console.log(`  Port: 0x${portC.toString(16).padStart(2, '0')} ${portC === 0xbe ? '(VDP data)' : ''}`);

      // Show first few bytes
      const bytes = [];
      for (let i = 0; i < Math.min(16, bc); i++) {
        bytes.push(bus.read8((hl + i) & 0xffff));
      }
      console.log(`  First bytes: ${bytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);

      // Check source location
      if (hl >= 0x8000 && hl < 0xc000) {
        const bank = currentBanks[Math.floor((hl - 0x8000) / 0x4000)];
        const romAddr = bank * 0x4000 + (hl & 0x3fff);
        console.log(`  Source in ROM bank ${bank}, ROM offset 0x${romAddr.toString(16)}`);

        // Check ROM data
        const romBytes = [];
        for (let i = 0; i < Math.min(16, bc); i++) {
          if (romAddr + i < rom.length) {
            romBytes.push(rom[romAddr + i]);
          }
        }
        console.log(`  ROM bytes: ${romBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);

        // Look for tile patterns (non-code)
        const hasPattern = romBytes.some(b => b !== 0x00 && b !== 0xff && b !== 0xc9 && b !== 0xc3);
        if (hasPattern) {
          console.log(`  >>> POTENTIAL TILE DATA <<<`);
        }
      } else if (hl >= 0xc000) {
        console.log(`  Source in RAM`);
      } else {
        console.log(`  Source in fixed ROM`);
      }

      // Check VDP state
      if (portC === 0xbe) {
        const vdpState = vdp.getState?.();
        if (!vdpState) {
          console.error('VDP state not available');
          process.exit(1);
        }
        console.log(`  VDP target: VRAM 0x${vdpState.curAddr.toString(16).padStart(4, '0')}, mode=${vdpState.curCode}`);
      }
    } else if (op2 === 0xa3) {
      // OUTI
      outiCount++;
      if (outiCount <= 10) {
        // Log first few
        const hl = (state.h << 8) | state.l;
        const portC = state.c;
        const srcVal = bus.read8(hl);

        console.log(
          `OUTI #${outiCount}: [0x${hl.toString(16).padStart(4, '0')}]=0x${srcVal.toString(16).padStart(2, '0')} -> port 0x${portC.toString(16).padStart(2, '0')}`
        );
      }
    }
  }

  const result = originalStepOne();
  totalCycles += result.cycles;

  return result;
};

// Run emulation
console.log('Running emulation for 100 frames...\n');

for (let frame = 0; frame < 100; frame++) {
  let cyclesInFrame = 0;
  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
    vdp.tickCycles(result.cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
  }

  if (frame % 20 === 0 && frame > 0) {
    console.log(`\nFrame ${frame}: OTIR=${otirCount}, OUTI=${outiCount}`);
  }
}

console.log('\n=== Summary ===');
console.log(`Total OTIR instructions: ${otirCount}`);
console.log(`Total OUTI instructions: ${outiCount}`);
