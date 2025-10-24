import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Trace VRAM Pattern Writes ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

// Track banking
const currentBanks = [0, 1, 2, 3]; // Initial bank configuration

const CYCLES_PER_FRAME = 59736;
let totalCycles = 0;

// Track pattern writes
const patternWrites: Array<{ cycle: number; addr: number; value: number; pc: number; opcode: string }> = [];
let writeCount = 0;
let captureWrites = false;
const startCaptureAfter = 3580000; // Just before first pattern write

// Hook bus writes to detect bank switching
const originalWrite8 = bus.write8.bind(bus);
bus.write8 = function (addr: number, val: number) {
  // SMS mappers typically use 0xFFFC-0xFFFF for bank switching
  if (addr >= 0xfffc && addr <= 0xffff) {
    const bankSlot = addr - 0xfffc;
    currentBanks[bankSlot] = val;
  }
  return originalWrite8(addr, val);
};

// Hook CPU to track current instruction
let currentPC = 0;
let currentOpcode = '';
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const state = cpu.getState();
  currentPC = state.pc;

  // Read opcode for logging
  const op = bus.read8(state.pc);
  if (op === 0xed) {
    const op2 = bus.read8((state.pc + 1) & 0xffff);
    if (op2 === 0xa3) currentOpcode = 'OUTI';
    else if (op2 === 0xb3) currentOpcode = 'OTIR';
    else currentOpcode = `ED ${op2.toString(16)}`;
  } else if (op === 0xd3) {
    currentOpcode = 'OUT';
  } else {
    currentOpcode = op.toString(16);
  }

  const result = originalStepOne();
  totalCycles += result.cycles;

  if (totalCycles > startCaptureAfter && !captureWrites) {
    captureWrites = true;
    console.log(`Started capturing writes at cycle ${totalCycles}\n`);
  }

  return result;
};

// Hook VDP writes to detect pattern uploads
const originalVdpWrite = vdp.writePort.bind(vdp);
vdp.writePort = function (port: number, val: number) {
  const result = originalVdpWrite(port, val);

  if (port === 0xbe && captureWrites) {
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
        writeCount++;

        // Capture first writes in detail
        if (patternWrites.length < 100) {
          patternWrites.push({
            cycle: totalCycles,
            addr,
            value: val,
            pc: currentPC,
            opcode: currentOpcode,
          });

          // Log first few writes
          if (writeCount <= 32) {
            const cpuState = cpu.getState();
            const hl = (cpuState.h << 8) | cpuState.l;

            console.log(
              `Write #${writeCount}: VRAM[0x${addr.toString(16).padStart(4, '0')}] = 0x${val.toString(16).padStart(2, '0')}`
            );
            console.log(
              `  PC=0x${currentPC.toString(16).padStart(4, '0')} (${currentOpcode}), HL=0x${hl.toString(16).padStart(4, '0')}`
            );

            // If it's an OUT instruction, check source
            if (currentOpcode === 'OUTI' || currentOpcode === 'OTIR') {
              const srcAddr = hl - 1; // HL is already incremented after OUTI
              const srcVal = bus.read8(srcAddr & 0xffff);
              console.log(
                `  Source: [0x${srcAddr.toString(16).padStart(4, '0')}] = 0x${srcVal.toString(16).padStart(2, '0')}`
              );

              // Check if source is in ROM
              if (srcAddr >= 0x8000 && srcAddr < 0xc000) {
                const bank = currentBanks[Math.floor((srcAddr - 0x8000) / 0x4000)];
                const romAddr = bank * 0x4000 + (srcAddr & 0x3fff);
                if (romAddr < rom.length) {
                  const romVal = rom[romAddr] ?? 0;
                  console.log(
                    `  ROM bank ${bank}, offset 0x${romAddr.toString(16)}: 0x${romVal.toString(16).padStart(2, '0')} ${romVal === val ? '✓' : `✗ (expected 0x${val.toString(16).padStart(2, '0')})`}`
                  );
                }
              }
            }

            // Every 8 writes (tile row boundary)
            if (writeCount % 8 === 0) {
              console.log('');
            }
          }
        }
      }
    }
  }

  return result;
};

// Run for a while
console.log('Running emulation until pattern writes...\n');

let frame = 0;
while (frame < 100 && writeCount < 256) {
  let cyclesInFrame = 0;
  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
    vdp.tickCycles(result.cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
  }
  frame++;
}

// Analysis
console.log('\n=== Analysis ===');
console.log(`Total pattern writes: ${writeCount}`);

// Group writes by instruction
const byOpcode = new Map<string, number>();
for (const write of patternWrites) {
  byOpcode.set(write.opcode, (byOpcode.get(write.opcode) || 0) + 1);
}

console.log('\nWrites by instruction:');
for (const [opcode, count] of byOpcode.entries()) {
  console.log(`  ${opcode}: ${count} writes`);
}

// Check for patterns
const values = patternWrites.map((w: any) => w.value);
const uniqueValues = new Set(values);
console.log(`\nUnique values written: ${uniqueValues.size}`);
console.log(
  `First 16 values: ${values
    .slice(0, 16)
    .map((v: any) => v.toString(16).padStart(2, '0'))
    .join(' ')}`
);

// Check if it's all zeros or has pattern
const nonZero = values.filter((v: any) => v !== 0);
console.log(`Non-zero values: ${nonZero.length} out of ${values.length}`);
if (nonZero.length > 0 && nonZero.length <= 20) {
  console.log(`Non-zero values: ${nonZero.map((v: any) => v.toString(16).padStart(2, '0')).join(' ')}`);
}

// Save trace
const traceData = {
  writes: patternWrites,
  summary: {
    totalWrites: writeCount,
    byOpcode: Object.fromEntries(byOpcode),
    uniqueValues: uniqueValues.size,
    nonZeroCount: nonZero.length,
  },
};

writeFileSync('vram_pattern_trace.json', JSON.stringify(traceData, null, 2));
console.log('\nDetailed trace saved to vram_pattern_trace.json');
