import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Trace RAM Buffer Filling ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

// Track banking
const currentBanks = [0, 1, 2, 3];

const CYCLES_PER_FRAME = 59736;
let totalCycles = 0;

// Monitor RAM buffer area (0xCC00-0xCFFF)
const bufferStart = 0xcc00;
const bufferEnd = 0xcfff;
const bufferWrites: Array<{ pc: number; addr: number; value: number; cycle: number }> = [];
let firstNonZeroWrite: any = null;

// Hook bus writes
const originalWrite8 = bus.write8.bind(bus);
bus.write8 = function (addr: number, val: number) {
  // Track banking
  if (addr >= 0xfffc && addr <= 0xffff) {
    const bankSlot = addr - 0xfffc;
    currentBanks[bankSlot] = val;
  }

  // Track writes to buffer area
  if (addr >= bufferStart && addr <= bufferEnd) {
    const state = cpu.getState();

    if (bufferWrites.length < 100) {
      bufferWrites.push({
        pc: state.pc,
        addr,
        value: val,
        cycle: totalCycles,
      });
    }

    // Log first non-zero write
    if (val !== 0 && !firstNonZeroWrite) {
      firstNonZeroWrite = { pc: state.pc, addr, value: val, cycle: totalCycles };

      console.log(`\n*** First non-zero write to buffer ***`);
      console.log(`  Cycle: ${totalCycles}`);
      console.log(`  PC: 0x${state.pc.toString(16).padStart(4, '0')}`);
      console.log(`  Address: 0x${addr.toString(16).padStart(4, '0')}`);
      console.log(`  Value: 0x${val.toString(16).padStart(2, '0')}`);

      // Check what instruction is writing
      const opcode = bus.read8(state.pc);
      console.log(`  Opcode at PC: 0x${opcode.toString(16).padStart(2, '0')}`);

      // If it's an LDIR, check source
      if (opcode === 0xed && bus.read8((state.pc + 1) & 0xffff) === 0xb0) {
        const hl = (state.h << 8) | state.l;
        console.log(`  LDIR source: HL=0x${hl.toString(16).padStart(4, '0')}`);

        // Check source location
        if (hl >= 0x8000 && hl < 0xc000) {
          const bank = currentBanks[Math.floor((hl - 0x8000) / 0x4000)];
          const romAddr = bank * 0x4000 + (hl & 0x3fff);
          console.log(`    ROM bank ${bank}, offset 0x${romAddr.toString(16)}`);

          // Show ROM data
          const romBytes = [];
          for (let i = 0; i < 16; i++) {
            if (romAddr + i < rom.length) {
              romBytes.push(rom[romAddr + i]);
            }
          }
          console.log(`    ROM data: ${romBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);
        }
      }
    }
  }

  return originalWrite8(addr, val);
};

// Monitor LDIR operations specifically targeting the buffer
let ldirToBuffer = 0;
let lastPC = 0;

// Hook CPU and track LDIR
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const state = cpu.getState();
  lastPC = state.pc;

  // Check for LDIR instruction
  if (bus.read8(state.pc) === 0xed && bus.read8((state.pc + 1) & 0xffff) === 0xb0) {
    const de = (state.d << 8) | state.e;
    const bc = (state.b << 8) | state.c;
    const hl = (state.h << 8) | state.l;

    if (de >= bufferStart && de <= bufferEnd && bc > 0) {
      ldirToBuffer++;

      console.log(`\nLDIR #${ldirToBuffer} to buffer:`);
      console.log(`  PC: 0x${state.pc.toString(16).padStart(4, '0')}`);
      console.log(`  Source: HL=0x${hl.toString(16).padStart(4, '0')}`);
      console.log(`  Dest: DE=0x${de.toString(16).padStart(4, '0')}`);
      console.log(`  Length: BC=${bc}`);

      // Check source
      const srcBytes = [];
      for (let i = 0; i < Math.min(16, bc); i++) {
        srcBytes.push(bus.read8((hl + i) & 0xffff));
      }
      console.log(`  Source data: ${srcBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);

      // Check if source is ROM
      if (hl >= 0x8000 && hl < 0xc000) {
        const bank = currentBanks[Math.floor((hl - 0x8000) / 0x4000)];
        const romAddr = bank * 0x4000 + (hl & 0x3fff);
        console.log(`  Source in ROM bank ${bank}, offset 0x${romAddr.toString(16)}`);

        // Show actual ROM data
        const romBytes = [];
        for (let i = 0; i < Math.min(16, bc); i++) {
          if (romAddr + i < rom.length) {
            romBytes.push(rom[romAddr + i]);
          }
        }
        console.log(`  ROM data: ${romBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);
      }
    }
  }

  const result = originalStepOne();
  totalCycles += result.cycles;
  return result;
};

// Run emulation
console.log('Running emulation for 80 frames (until OUTI starts)...\n');

for (let frame = 0; frame < 80; frame++) {
  let cyclesInFrame = 0;
  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
    vdp.tickCycles(result.cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
  }

  if (frame % 20 === 0) {
    const state = cpu.getState();
    console.log(
      `Frame ${frame}: PC=0x${state.pc.toString(16).padStart(4, '0')}, Buffer writes: ${bufferWrites.length}`
    );
  }
}

// Analysis
console.log('\n=== Analysis ===');
console.log(`Total writes to buffer: ${bufferWrites.length}`);
console.log(`LDIR operations to buffer: ${ldirToBuffer}`);

if (firstNonZeroWrite) {
  console.log(`\nFirst non-zero write:`);
  console.log(`  PC: 0x${firstNonZeroWrite.pc.toString(16).padStart(4, '0')}`);
  console.log(`  Address: 0x${firstNonZeroWrite.addr.toString(16).padStart(4, '0')}`);
  console.log(`  Value: 0x${firstNonZeroWrite.value.toString(16).padStart(2, '0')}`);
} else {
  console.log(`\nNo non-zero writes to buffer detected!`);

  // Check buffer contents
  console.log('\nBuffer contents at 0xCC00-0xCC1F:');
  const bytes = [];
  for (let i = 0; i < 32; i++) {
    bytes.push(bus.read8(bufferStart + i));
  }
  console.log(bytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' '));
}
