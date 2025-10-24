#!/usr/bin/env tsx

/**
 * CPU Trace Capture Tool
 *
 * Executes a game ROM in the emulator and captures detailed CPU state at each instruction.
 * Output can be compared against MAME traces for validation.
 *
 * Usage:
 *   tsx tools/trace_cpu.ts <rom_path> [options]
 *
 * Options:
 *   --frames <n>        Number of frames to execute (default: 10)
 *   --max-cycles <n>    Max cycles to execute (default: unlimited)
 *   --every <n>         Capture every Nth instruction (default: 1)
 *   --output <file>     Output file path (default: artifacts/trace_<timestamp>.json)
 *   --verbose           Print progress to console
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Cartridge } from '../src/bus/bus.js';
import { createMachine } from '../src/machine/machine.js';

interface TraceEntry {
  cycle: number;
  instruction: number;
  pc: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  f: number;
  sp: number;
  ix: number;
  iy: number;
  i: number;
  r: number;
  iff1: boolean;
  iff2: boolean;
  halted: boolean;
  im: number;
  opcode?: string;
}

interface TraceOutput {
  metadata: {
    rom: string;
    emulator: string;
    version: string;
    timestamp: string;
    frames: number;
    cycles: number;
    instructions: number;
  };
  trace: TraceEntry[];
}

const parseArgs = (
  args: string[]
): {
  romPath: string;
  frames: number;
  maxCycles: number;
  every: number;
  output: string;
  verbose: boolean;
} => {
  if (args.length < 3) {
    console.error('Usage: tsx tools/trace_cpu.ts <rom_path> [options]');
    console.error('Options:');
    console.error('  --frames <n>        Number of frames to execute (default: 10)');
    console.error('  --max-cycles <n>    Max cycles to execute (default: unlimited)');
    console.error('  --every <n>         Capture every Nth instruction (default: 1)');
    console.error('  --output <file>     Output file path');
    console.error('  --verbose           Print progress');
    process.exit(1);
  }

  const romPath = args[2];
  let frames = 10;
  let maxCycles = Infinity;
  let every = 1;
  let output = '';
  let verbose = false;

  for (let i = 3; i < args.length; i++) {
    switch (args[i]) {
      case '--frames':
        frames = parseInt(args[++i], 10);
        break;
      case '--max-cycles':
        maxCycles = parseInt(args[++i], 10);
        break;
      case '--every':
        every = parseInt(args[++i], 10);
        break;
      case '--output':
        output = args[++i];
        break;
      case '--verbose':
        verbose = true;
        break;
    }
  }

  if (!output) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    output = `artifacts/trace_${timestamp}.json`;
  }

  return { romPath, frames, maxCycles, every, output, verbose };
};

const captureTrace = async (
  romPath: string,
  frames: number,
  maxCycles: number,
  every: number,
  verbose: boolean
): Promise<TraceOutput> => {
  if (verbose) console.log(`Loading ROM: ${romPath}`);
  const romData = fs.readFileSync(romPath);

  if (verbose) console.log('Creating SMS system...');
  const cartridge: Cartridge = { rom: romData };
  const machine = createMachine({ cart: cartridge });
  const cpu = machine.getCPU();

  const trace: TraceEntry[] = [];
  let cycle = 0;
  let instruction = 0;
  let frameCount = 0;
  let lastFrameCycle = 0;

  // SMS runs at ~59.7 Hz, each frame is ~3500 cycles (approximate)
  const cyclesPerFrame = 3500; // Approximate

  if (verbose) console.log(`Capturing up to ${frames} frames...`);

  while (frameCount < frames && cycle < maxCycles) {
    const cpuState = cpu.getState();

    // Capture trace entry if it matches "every" threshold
    if (instruction % every === 0) {
      trace.push({
        cycle,
        instruction,
        pc: cpuState.pc,
        a: cpuState.a,
        b: cpuState.b,
        c: cpuState.c,
        d: cpuState.d,
        e: cpuState.e,
        h: cpuState.h,
        l: cpuState.l,
        f: cpuState.f,
        sp: cpuState.sp,
        ix: cpuState.ix,
        iy: cpuState.iy,
        i: cpuState.i,
        r: cpuState.r,
        iff1: cpuState.iff1,
        iff2: cpuState.iff2,
        halted: cpuState.halted,
        im: cpuState.im,
      });
    }

    // Execute one instruction
    const result = cpu.stepOne();
    cycle += result.cycles;
    instruction++;

    // Check if frame boundary crossed
    if (cycle - lastFrameCycle >= cyclesPerFrame) {
      frameCount++;
      lastFrameCycle = cycle;
      if (verbose) {
        console.log(`  Frame ${frameCount}: cycle=${cycle}, instruction=${instruction}`);
      }
    }
  }

  if (verbose) console.log(`Trace capture complete: ${trace.length} entries, ${cycle} cycles`);

  return {
    metadata: {
      rom: path.basename(romPath),
      emulator: 'ai-sms-gpt5',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      frames: frameCount,
      cycles: cycle,
      instructions: instruction,
    },
    trace,
  };
};

const main = async (): Promise<void> => {
  const { romPath, frames, maxCycles, every, output, verbose } = parseArgs(process.argv);

  // Validate ROM exists
  if (!fs.existsSync(romPath)) {
    console.error(`Error: ROM not found: ${romPath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const traceData = await captureTrace(romPath, frames, maxCycles, every, verbose);

    // Write trace to file
    fs.writeFileSync(output, JSON.stringify(traceData, null, 2));

    if (verbose) console.log(`Trace written to: ${output}`);
    console.log(`✓ Trace captured: ${traceData.trace.length} entries`);
    console.log(`  ROM: ${traceData.metadata.rom}`);
    console.log(`  Frames: ${traceData.metadata.frames}`);
    console.log(`  Cycles: ${traceData.metadata.cycles}`);
    console.log(`  Instructions: ${traceData.metadata.instructions}`);
    console.log(`  Output: ${output}`);
  } catch (error) {
    console.error('Error capturing trace:', error);
    process.exit(1);
  }
};

main();
