#!/usr/bin/env tsx

/**
 * Trace Comparison Tool
 *
 * Compares CPU traces from our emulator against MAME reference traces.
 * Identifies divergences and provides detailed analysis.
 *
 * Usage:
 *   tsx tools/compare_traces.ts <our-trace.json> <mame-trace.json> [options]
 *
 * Options:
 *   --max-diff <n>      Stop after Nth divergence (default: 10)
 *   --verbose           Print detailed output
 *   --output <file>     Write report to file
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

interface TraceData {
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

interface Divergence {
  index: number;
  instruction: number;
  cycle: number;
  field: string;
  our: unknown;
  mame: unknown;
}

interface ComparisonResult {
  match: boolean;
  totalEntries: number;
  divergences: Divergence[];
  summary: string;
  matchPercentage: number;
}

const parseArgs = (
  args: string[]
): {
  ourTrace: string;
  mameTrace: string;
  maxDiff: number;
  verbose: boolean;
  output: string;
} => {
  if (args.length < 4) {
    console.error('Usage: tsx tools/compare_traces.ts <our-trace.json> <mame-trace.json> [options]');
    console.error('Options:');
    console.error('  --max-diff <n>      Stop after Nth divergence (default: 10)');
    console.error('  --verbose           Print detailed output');
    console.error('  --output <file>     Write report to file');
    process.exit(1);
  }

  const ourTrace = args[2];
  const mameTrace = args[3];
  let maxDiff = 10;
  let verbose = false;
  let output = '';

  for (let i = 4; i < args.length; i++) {
    switch (args[i]) {
      case '--max-diff':
        maxDiff = parseInt(args[++i], 10);
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--output':
        output = args[++i];
        break;
    }
  }

  return { ourTrace, mameTrace, maxDiff, verbose, output };
};

const loadTrace = (filePath: string): TraceData => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Trace file not found: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
};

const compareTraces = (ourData: TraceData, mameData: TraceData, maxDiff: number): ComparisonResult => {
  const ourTrace = ourData.trace;
  const mameTrace = mameData.trace;
  const divergences: Divergence[] = [];

  const minLength = Math.min(ourTrace.length, mameTrace.length);
  const registerFields: (keyof TraceEntry)[] = ['pc', 'a', 'b', 'c', 'd', 'e', 'h', 'l', 'f', 'sp', 'ix', 'iy', 'i', 'r'];

  for (let i = 0; i < minLength && divergences.length < maxDiff; i++) {
    const ourEntry = ourTrace[i];
    const mameEntry = mameTrace[i];

    for (const field of registerFields) {
      const ourValue = ourEntry[field];
      const mameValue = mameEntry[field];

      if (ourValue !== mameValue) {
        divergences.push({
          index: i,
          instruction: ourEntry.instruction,
          cycle: ourEntry.cycle,
          field: field as string,
          our: ourValue,
          mame: mameValue,
        });
        break; // Only report first divergence per entry
      }
    }
  }

  const match = divergences.length === 0;
  const matchPercentage = minLength > 0 ? ((minLength - divergences.length) / minLength) * 100 : 0;

  let summary = match ? '✓ PERFECT MATCH' : `✗ ${divergences.length} divergence(s) found`;
  if (ourTrace.length !== mameTrace.length) {
    summary += ` (length mismatch: ours=${ourTrace.length}, mame=${mameTrace.length})`;
  }

  return {
    match,
    totalEntries: minLength,
    divergences,
    summary,
    matchPercentage,
  };
};

const generateReport = (
  ourData: TraceData,
  mameData: TraceData,
  result: ComparisonResult,
  verbose: boolean
): string => {
  let report = '';

  report += '# CPU Trace Comparison Report\n\n';
  report += `**Generated**: ${new Date().toISOString()}\n\n`;

  report += '## Summary\n\n';
  report += `- **Result**: ${result.summary}\n`;
  report += `- **Match Rate**: ${result.matchPercentage.toFixed(2)}%\n`;
  report += `- **Total Entries Compared**: ${result.totalEntries}\n`;
  report += `- **Divergences**: ${result.divergences.length}\n\n`;

  report += '## Trace Metadata\n\n';
  report += '### Our Emulator\n';
  report += `- ROM: ${ourData.metadata.rom}\n`;
  report += `- Emulator: ${ourData.metadata.emulator}\n`;
  report += `- Frames: ${ourData.metadata.frames}\n`;
  report += `- Cycles: ${ourData.metadata.cycles}\n`;
  report += `- Instructions: ${ourData.metadata.instructions}\n`;
  report += `- Trace Size: ${ourData.trace.length} entries\n\n`;

  report += '### MAME Reference\n';
  report += `- ROM: ${mameData.metadata.rom}\n`;
  report += `- Emulator: ${mameData.metadata.emulator}\n`;
  report += `- Frames: ${mameData.metadata.frames}\n`;
  report += `- Cycles: ${mameData.metadata.cycles}\n`;
  report += `- Instructions: ${mameData.metadata.instructions}\n`;
  report += `- Trace Size: ${mameData.trace.length} entries\n\n`;

  if (result.divergences.length > 0) {
    report += '## Divergences\n\n';

    for (const div of result.divergences) {
      report += `### Divergence #${result.divergences.indexOf(div) + 1}\n`;
      report += `- **Entry Index**: ${div.index}\n`;
      report += `- **Instruction**: ${div.instruction}\n`;
      report += `- **Cycle**: ${div.cycle}\n`;
      report += `- **Field**: ${div.field}\n`;
      report += `- **Our Value**: 0x${(div.our as number).toString(16).padStart(4, '0').toUpperCase()}\n`;
      report += `- **MAME Value**: 0x${(div.mame as number).toString(16).padStart(4, '0').toUpperCase()}\n`;

      if (verbose && div.index < result.totalEntries) {
        const ourEntry = ourData.trace[div.index];
        const mameEntry = mameData.trace[div.index];
        report += '\n**Full CPU State (Ours)**:\n';
        report += `PC=0x${ourEntry.pc.toString(16).padStart(4, '0')} `;
        report += `AF=0x${((ourEntry.a << 8) | ourEntry.f).toString(16).padStart(4, '0')} `;
        report += `BC=0x${((ourEntry.b << 8) | ourEntry.c).toString(16).padStart(4, '0')} `;
        report += `DE=0x${((ourEntry.d << 8) | ourEntry.e).toString(16).padStart(4, '0')} `;
        report += `HL=0x${((ourEntry.h << 8) | ourEntry.l).toString(16).padStart(4, '0')}\n`;

        report += '**Full CPU State (MAME)**:\n';
        report += `PC=0x${mameEntry.pc.toString(16).padStart(4, '0')} `;
        report += `AF=0x${((mameEntry.a << 8) | mameEntry.f).toString(16).padStart(4, '0')} `;
        report += `BC=0x${((mameEntry.b << 8) | mameEntry.c).toString(16).padStart(4, '0')} `;
        report += `DE=0x${((mameEntry.d << 8) | mameEntry.e).toString(16).padStart(4, '0')} `;
        report += `HL=0x${((mameEntry.h << 8) | mameEntry.l).toString(16).padStart(4, '0')}\n`;
      }

      report += '\n';
    }
  }

  report += '## Conclusion\n\n';
  if (result.match) {
    report += '✅ **PASS**: Emulator CPU produces identical traces to MAME.\n';
  } else {
    report += '❌ **FAIL**: Emulator diverges from MAME. See divergences above for details.\n';
  }

  return report;
};

const main = (): void => {
  const { ourTrace, mameTrace, maxDiff, verbose, output } = parseArgs(process.argv);

  try {
    if (verbose) console.log('Loading traces...');
    const ourData = loadTrace(ourTrace);
    const mameData = loadTrace(mameTrace);

    if (verbose) console.log('Comparing traces...');
    const result = compareTraces(ourData, mameData, maxDiff);

    const report = generateReport(ourData, mameData, result, verbose);

    if (output) {
      fs.writeFileSync(output, report);
      if (verbose) console.log(`Report written to: ${output}`);
    }

    console.log(report);

    // Exit with status code
    process.exit(result.match ? 0 : 1);
  } catch (error) {
    console.error('Error comparing traces:', error);
    process.exit(1);
  }
};

main();
