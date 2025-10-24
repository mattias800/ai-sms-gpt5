import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Trace Tile Data Copying ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

// Track banking
const currentBanks = [0, 1, 2]; // Initial bank configuration
const bankWrites: Array<{ cycle: number; addr: number; value: number }> = [];

// Track LDIR instructions
let ldirCount = 0;
const ldirTraces: Array<{ pc: number; hl: number; de: number; bc: number; firstBytes: number[] }> = [];

// Track significant VRAM writes
let vramPatternWrites = 0;
let firstPatternWrite = -1;

const CYCLES_PER_FRAME = 59736;
let totalCycles = 0;

// Hook bus writes to detect bank switching
const originalWrite8 = bus.write8.bind(bus);
bus.write8 = function (addr: number, val: number) {
  // SMS mappers typically use 0xFFFC-0xFFFF for bank switching
  if (addr >= 0xfffc && addr <= 0xffff) {
    const bankSlot = addr - 0xfffc;
    bankWrites.push({ cycle: totalCycles, addr, value: val });
    if (bankWrites.length <= 5) {
      console.log(
        `\nBank write: [0x${addr.toString(16)}] = 0x${val.toString(16).padStart(2, '0')} (bank ${val}) at cycle ${totalCycles}`
      );
    }
    currentBanks[bankSlot] = val;
  }
  return originalWrite8(addr, val);
};

// Hook CPU to detect LDIR
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const state = cpu.getState();

  // Check for LDIR (0xED 0xB0)
  if (bus.read8(state.pc) === 0xed && bus.read8((state.pc + 1) & 0xffff) === 0xb0) {
    ldirCount++;
    const hl = (state.h << 8) | state.l;
    const de = (state.d << 8) | state.e;
    const bc = (state.b << 8) | state.c;

    // Read first few bytes from source
    const firstBytes = [];
    for (let i = 0; i < Math.min(8, bc); i++) {
      firstBytes.push(bus.read8((hl + i) & 0xffff));
    }

    ldirTraces.push({ pc: state.pc, hl, de, bc, firstBytes });

    if (ldirCount <= 5 || (de >= 0x0000 && de < 0x4000)) {
      // Show first few or VRAM destinations
      console.log(`\nLDIR #${ldirCount} at PC=0x${state.pc.toString(16).padStart(4, '0')}:`);
      console.log(`  Source: HL=0x${hl.toString(16).padStart(4, '0')} (${bc} bytes)`);
      console.log(`  Dest:   DE=0x${de.toString(16).padStart(4, '0')}`);
      console.log(`  First bytes: ${firstBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`);

      // Check if source is in ROM
      if (hl < 0x8000 || hl >= 0xc000) {
        console.log(`  Source is in ${hl < 0x8000 ? 'ROM (fixed)' : 'RAM'}`);
      } else {
        const bank = currentBanks[Math.floor((hl - 0x8000) / 0x4000)];
        const romAddr = bank * 0x4000 + (hl & 0x3fff);
        console.log(`  Source is in ROM bank ${bank} (ROM addr 0x${romAddr.toString(16)})`);

        // Compare with actual ROM data
        const romBytes = [];
        for (let i = 0; i < Math.min(8, bc); i++) {
          if (romAddr + i < rom.length) {
            romBytes.push(rom[romAddr + i]);
          }
        }
        console.log(
          `  ROM data at that address: ${romBytes.map((b: any) => b.toString(16).padStart(2, '0')).join(' ')}`
        );

        // Check if they match
        let match = true;
        for (let i = 0; i < Math.min(firstBytes.length, romBytes.length); i++) {
          if (firstBytes[i] !== romBytes[i]) match = false;
        }
        console.log(`  ${match ? '✓ Data matches ROM' : '✗ Data DOES NOT match ROM!'}`);
      }
    }
  }

  const result = originalStepOne();
  totalCycles += result.cycles;

  return result;
};

// Hook VDP writes to detect pattern uploads
const originalVdpWrite = vdp.writePort.bind(vdp);
vdp.writePort = function (port: number, val: number) {
  const result = originalVdpWrite(port, val);

  if (port === 0xbe) {
    // Data port
    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }
    if (vdpState && vdpState.curCode === 1) {
      // VRAM write
      const addr = (vdpState.curAddr - 1) & 0x3fff; // Address before auto-increment
      if (addr < 0x2000) {
        // Pattern table area
        vramPatternWrites++;
        if (firstPatternWrite === -1) {
          firstPatternWrite = totalCycles;
          console.log(
            `\nFirst pattern write at cycle ${totalCycles}, VRAM addr 0x${addr.toString(16).padStart(4, '0')}, value 0x${val.toString(16).padStart(2, '0')}`
          );
        }
      }
    }
  }

  return result;
};

// Run for a while
console.log('Running emulation for 100 frames...\n');

for (let frame = 0; frame < 100; frame++) {
  let cyclesInFrame = 0;
  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
    vdp.tickCycles(result.cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
  }

  if (frame % 20 === 0) {
    const cpuState = cpu.getState();
    console.log(`Frame ${frame}: PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, Banks=[${currentBanks.join(',')}]`);
  }
}

// Analysis
console.log('\n=== Analysis ===');
console.log(`Total bank switches: ${bankWrites.length}`);
console.log(`Total LDIR operations: ${ldirCount}`);
console.log(`Pattern VRAM writes: ${vramPatternWrites}`);

// Find LDIR operations that wrote to VRAM pattern area
const vramLdirs = ldirTraces.filter((t: any) => t.de >= 0x0000 && t.de < 0x2000);
console.log(`\nLDIR operations to pattern VRAM (0x0000-0x1FFF): ${vramLdirs.length}`);

if (vramLdirs.length > 0) {
  console.log('\nFirst few LDIR to pattern VRAM:');
  for (let i = 0; i < Math.min(3, vramLdirs.length); i++) {
    const ldir = vramLdirs[i];
    console.log(
      `  ${i + 1}. HL=0x${ldir.hl.toString(16).padStart(4, '0')} -> DE=0x${ldir.de.toString(16).padStart(4, '0')} (${ldir.bc} bytes)`
    );
    console.log(
      `     First bytes: ${ldir.firstBytes
        .slice(0, 8)
        .map((b: any) => b.toString(16).padStart(2, '0'))
        .join(' ')}`
    );
  }
}

// Save detailed trace
const traceData = {
  bankWrites: bankWrites.slice(0, 100),
  ldirTraces: ldirTraces.slice(0, 100),
  summary: {
    totalBankWrites: bankWrites.length,
    totalLdirs: ldirCount,
    vramPatternWrites,
    finalBanks: currentBanks,
  },
};

writeFileSync('tile_copy_trace.json', JSON.stringify(traceData, null, 2));
console.log('\nDetailed trace saved to tile_copy_trace.json');
