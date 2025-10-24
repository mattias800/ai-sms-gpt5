#!/usr/bin/env tsx

/**
 * Generate Mock MAME Reference Traces
 *
 * Creates realistic MAME-like trace output for testing Phase 3 validation tools
 * These can be replaced with real MAME traces later
 */

import * as fs from 'fs';
import * as path from 'path';

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
}

interface TraceOutput {
  metadata: {
    rom: string;
    emulator: string;
    timestamp: string;
    frames: number;
    cycles: number;
    instructions: number;
  };
  trace: TraceEntry[];
}

/**
 * Generate a mock MAME trace that simulates realistic Z80 boot sequence
 * This represents what we'd expect from MAME running the same ROM
 */
const generateMockMAMETrace = (romName: string, frames: number): TraceOutput => {
  const trace: TraceEntry[] = [];
  let pc = 0x0000;
  let cycle = 0;
  let instruction = 0;
  let r = 0x00;
  let a = 0x00;
  let sp = 0xdff0;

  // Simulate boot sequence similar to our emulator
  // MAME would execute the exact same instructions
  const bootSequence = [
    // LD SP, 0xDFF0 (typical boot)
    { op: 'LD SP,nn', cycles: 10, nextPc: 0x0003 },
    // DI (disable interrupts)
    { op: 'DI', cycles: 4, nextPc: 0x0004 },
    // XOR A (clear accumulator)
    { op: 'XOR A', cycles: 4, nextPc: 0x0005 },
    // LD B,0x00
    { op: 'LD B,n', cycles: 7, nextPc: 0x0007 },
    // LD C,0x00
    { op: 'LD C,n', cycles: 7, nextPc: 0x0009 },
    // LD D,0x00
    { op: 'LD D,n', cycles: 7, nextPc: 0x000b },
    // LD E,0x00
    { op: 'LD E,n', cycles: 7, nextPc: 0x000d },
    // LD H,0x00
    { op: 'LD H,n', cycles: 7, nextPc: 0x000f },
    // LD L,0x00
    { op: 'LD L,n', cycles: 7, nextPc: 0x0011 },
  ];

  // Add boot sequence to trace
  for (const step of bootSequence) {
    trace.push({
      cycle,
      instruction,
      pc,
      a,
      b: 0x00,
      c: 0x00,
      d: 0x00,
      e: 0x00,
      h: 0x00,
      l: 0x00,
      f: 0x00,
      sp,
      ix: 0x0000,
      iy: 0x0000,
      i: 0x00,
      r: (r & 0x80) | ((r + 1) & 0x7f),
      iff1: false,
      iff2: false,
      halted: false,
      im: 1,
    });
    cycle += step.cycles;
    instruction++;
    pc = step.nextPc;
    r = (r & 0x80) | ((r + 1) & 0x7f);
  }

  // Fill rest of trace with loop pattern (simulating main loop)
  const loopStart = pc;
  let loopCount = 0;
  while (loopCount < frames && trace.length < 50000) {
    // Simulate main loop: NOP, JR -1
    trace.push({
      cycle,
      instruction,
      pc,
      a,
      b: 0x00,
      c: 0x00,
      d: 0x00,
      e: 0x00,
      h: 0x00,
      l: 0x00,
      f: 0x00,
      sp,
      ix: 0x0000,
      iy: 0x0000,
      i: 0x00,
      r: (r & 0x80) | ((r + 1) & 0x7f),
      iff1: false,
      iff2: false,
      halted: false,
      im: 1,
    });

    cycle += 4; // NOP
    instruction++;
    pc = (pc + 1) & 0xffff;
    r = (r & 0x80) | ((r + 1) & 0x7f);

    // Every 100 instructions, simulate a frame boundary
    if (instruction % 100 === 0) {
      loopCount++;
    }
  }

  const cyclesPerFrame = Math.floor(cycle / Math.max(1, loopCount));

  return {
    metadata: {
      rom: romName,
      emulator: 'MAME',
      timestamp: new Date().toISOString(),
      frames: loopCount,
      cycles: cycle,
      instructions: instruction,
    },
    trace,
  };
};

const main = (): void => {
  const outputDir = path.join(process.cwd(), 'artifacts', 'mame_traces');

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate traces for test ROMs
  const roms = [
    { name: 'alexkidd', frames: 50 },
    { name: 'sonic1', frames: 100 },
    { name: 'wonderboy', frames: 50 },
  ];

  for (const rom of roms) {
    const trace = generateMockMAMETrace(rom.name, rom.frames);
    const filename = `${rom.name}_mame.json`;
    const filepath = path.join(outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(trace, null, 2));
    console.log(`✓ Generated mock MAME trace: ${filepath}`);
  }

  console.log('\n✅ Mock MAME traces generated successfully');
  console.log(`Location: ${outputDir}`);
  console.log('\nNote: These are mock traces. To get real validation:');
  console.log('1. Run each ROM in MAME with trace output');
  console.log('2. Replace mock traces with real MAME output');
  console.log('3. Re-run comparison for actual validation\n');
};

main();
