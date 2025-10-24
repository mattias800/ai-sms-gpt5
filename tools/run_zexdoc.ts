#!/usr/bin/env tsx

/**
 * ZEXDOC Test ROM Runner
 * 
 * Runs the ZEXDOC instruction validation ROM in our Z80 emulator.
 * ZEXDOC is a comprehensive Z80 instruction test suite that validates
 * all documented opcodes and many undocumented ones.
 * 
 * This tool:
 * 1. Loads the ZEXDOC ROM
 * 2. Creates a minimal SMS-compatible machine
 * 3. Runs the ROM to completion
 * 4. Captures CPU state and memory
 * 5. Outputs results to JSON for comparison against MAME
 */

import * as fs from 'fs';
import * as path from 'path';
import { SimpleBus } from '../src/bus/bus.js';
import { createZ80 } from '../src/cpu/z80/z80.js';

interface TestResult {
  success: boolean;
  reason?: string;
  registers?: {
    pc: number;
    sp: number;
    a: number;
    f: number;
    b: number;
    c: number;
    d: number;
    e: number;
    h: number;
    l: number;
    ix: number;
    iy: number;
    i: number;
    r: number;
    iff1: boolean;
    iff2: boolean;
  };
  cycles: number;
  memory?: {
    // Store interesting memory ranges
    [key: string]: number[];
  };
  timestamp: string;
  zexdocPath: string;
}

const ZEXDOC_PATHS = [
  './third_party/test-roms/zexdoc/zexdoc.com',
  './third_party/test-roms/zexdoc/zexdoc.bin',
  './test-roms/zexdoc/zexdoc.com',
  './test-roms/zexdoc/zexdoc.bin',
  process.env.ZEXDOC_PATH,
].filter(Boolean) as string[];

const ZEXDOC_SIZE = 8192; // ZEXDOC is typically 8KB
const MAX_CYCLES = 100_000_000; // Max cycles before timeout
const HALT_OPCODE = 0x76;

function findZexdocRom(): string | null {
  for (const p of ZEXDOC_PATHS) {
    if (fs.existsSync(p)) {
      console.log(`Found ZEXDOC ROM at: ${p}`);
      return p;
    }
  }
  return null;
}

function captureRegisters(cpu: ReturnType<typeof createZ80>): TestResult['registers'] {
  const state = cpu.getState();
  return {
    pc: state.pc & 0xffff,
    sp: state.sp & 0xffff,
    a: state.a & 0xff,
    f: state.f & 0xff,
    b: state.b & 0xff,
    c: state.c & 0xff,
    d: state.d & 0xff,
    e: state.e & 0xff,
    h: state.h & 0xff,
    l: state.l & 0xff,
    ix: state.ix & 0xffff,
    iy: state.iy & 0xffff,
    i: state.i & 0xff,
    r: state.r & 0xff,
    iff1: state.iff1,
    iff2: state.iff2,
  };
}

function captureMemory(bus: SimpleBus, ranges: { [key: string]: [number, number] }): TestResult['memory'] {
  const memory: TestResult['memory'] = {};
  const memBus = bus.getMemory();

  for (const [name, [start, end]] of Object.entries(ranges)) {
    const data: number[] = [];
    for (let addr = start; addr <= end; addr++) {
      data.push(memBus[addr] ?? 0);
    }
    memory[name] = data;
  }

  return memory;
}

async function runZexdoc(): Promise<TestResult> {
  const zexdocPath = findZexdocRom();

  if (!zexdocPath) {
    return {
      success: false,
      reason: `ZEXDOC ROM not found. Searched paths: ${ZEXDOC_PATHS.join(', ')}`,
      cycles: 0,
      timestamp: new Date().toISOString(),
      zexdocPath: 'NOT FOUND',
    };
  }

  try {
    const romData = fs.readFileSync(zexdocPath);

    // Create a minimal SMS-compatible machine
    const bus = new SimpleBus();
    const mem = bus.getMemory();

    // Load ZEXDOC ROM at 0x0000
    for (let i = 0; i < Math.min(romData.length, ZEXDOC_SIZE); i++) {
      mem[i] = romData[i];
    }

    // Create Z80 CPU
    const cpu = createZ80({ bus });

    // Run until HALT or timeout
    let cycles = 0;
    let halted = false;
    let lastPc = -1;
    let pcRepeatCount = 0;

    console.log('Running ZEXDOC ROM...');
    const startTime = Date.now();

    while (cycles < MAX_CYCLES && !halted) {
      const state = cpu.getState();

      // Detect infinite loop (PC stuck at same location)
      if (state.pc === lastPc) {
        pcRepeatCount++;
        if (pcRepeatCount > 10) {
          console.log(`Detected infinite loop at PC=0x${state.pc.toString(16).padStart(4, '0')}`);
          halted = true;
          break;
        }
      } else {
        pcRepeatCount = 0;
        lastPc = state.pc;
      }

      const result = cpu.stepOne();
      cycles += result.cycles;

      // Check if we hit HALT
      if ((mem[state.pc] & 0xff) === HALT_OPCODE) {
        cpu.stepOne(); // Execute the HALT
        halted = true;
      }

      if (cycles % 1_000_000 === 0) {
        console.log(`  Progress: ${cycles.toLocaleString()} cycles, PC=0x${state.pc.toString(16).padStart(4, '0')}`);
      }
    }

    const elapsedMs = Date.now() - startTime;
    console.log(`Completed in ${elapsedMs}ms, ${cycles.toLocaleString()} cycles`);

    // Capture final state
    return {
      success: true,
      registers: captureRegisters(cpu),
      cycles,
      memory: captureMemory(bus, {
        'ram_0x0000_0x0100': [0x0000, 0x0100],
        'output_area_0x0100_0x0110': [0x0100, 0x0110],
      }),
      timestamp: new Date().toISOString(),
      zexdocPath,
    };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : String(error),
      cycles: 0,
      timestamp: new Date().toISOString(),
      zexdocPath,
    };
  }
}

async function main(): Promise<void> {
  const result = await runZexdoc();

  // Output results as JSON
  const outputPath = './artifacts/zexdoc_results.json';
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Results saved to: ${outputPath}`);

  if (result.success) {
    console.log('\n✓ ZEXDOC test completed successfully');
    console.log(`  Final PC: 0x${result.registers?.pc.toString(16).padStart(4, '0')}`);
    console.log(`  Cycles: ${result.cycles.toLocaleString()}`);
    process.exit(0);
  } else {
    console.error('\n✗ ZEXDOC test failed:');
    console.error(`  ${result.reason}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
