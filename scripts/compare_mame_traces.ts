import * as fs from 'fs';

interface TraceEntry {
  cycle: number;
  instruction: number;
  pc: number;
  a?: number;
  b?: number;
  c?: number;
  d?: number;
  e?: number;
  h?: number;
  l?: number;
  f?: number;
  sp: number;
  ix: number;
  iy: number;
  i?: number;
  r: number;
  iff1?: boolean;
  iff2?: boolean;
  halted?: boolean;
  im?: number;
}

interface ComparisonResult {
  game: string;
  ourTraceFile: string;
  mameTraceFile: string;
  totalFrames: number;
  totalInstructions: number;
  matchCount: number;
  divergenceCount: number;
  divergenceRate: number;
  firstDivergence: {
    frame?: number;
    instructionNumber?: number;
    ourEntry?: TraceEntry;
    mameEntry?: TraceEntry;
    reason: string;
  } | null;
  details: {
    instructionsMismatch: number;
    pcMismatch: number;
    registersMismatch: number;
    otherMismatch: number;
  };
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const loadTrace = (filePath: string): TraceEntry[] => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data;
  }
  if (data.trace && Array.isArray(data.trace)) {
    return data.trace;
  }
  if (data.entries && Array.isArray(data.entries)) {
    return data.entries;
  }
  return [];
};

const compareRegisters = (
  ours: TraceEntry,
  theirs: TraceEntry
): { match: boolean; differences: string[] } => {
  const differences: string[] = [];

  // Compare all available registers
  const registerFields = [
    'a', 'b', 'c', 'd', 'e', 'h', 'l', 'f',
    'sp', 'ix', 'iy', 'i', 'r'
  ] as const;

  for (const field of registerFields) {
    const ourVal = ours[field];
    const theirVal = theirs[field];

    // If either has the value, compare
    if (ourVal !== undefined && theirVal !== undefined) {
      if (ourVal !== theirVal) {
        differences.push(
          `${field}: ours=${ourVal.toString(16).padStart(2, '0')} vs mame=${theirVal.toString(16).padStart(2, '0')}`
        );
      }
    }
  }

  return {
    match: differences.length === 0,
    differences
  };
};

const compareTraces = (
  ourTrace: TraceEntry[],
  mameTrace: TraceEntry[],
  gameName: string
): ComparisonResult => {
  let matchCount = 0;
  let divergenceCount = 0;
  let firstDivergence: ComparisonResult['firstDivergence'] = null;

  const detailCounts = {
    instructionsMismatch: 0,
    pcMismatch: 0,
    registersMismatch: 0,
    otherMismatch: 0
  };

  // Build maps by instruction number for alignment
  const ourByInstr = new Map<number, TraceEntry>();
  const mameByInstr = new Map<number, TraceEntry>();

  for (const entry of ourTrace) {
    ourByInstr.set(entry.instruction, entry);
  }
  for (const entry of mameTrace) {
    mameByInstr.set(entry.instruction, entry);
  }

  // Get common instruction numbers (limit to first 5000 for comparison)
  const ourInstr = new Set(ourByInstr.keys());
  const mameInstr = new Set(mameByInstr.keys());
  const commonInstr = new Set<number>();

  for (const instr of ourInstr) {
    if (mameInstr.has(instr) && instr < 5001) {
      commonInstr.add(instr);
    }
  }

  const compareInstr = Array.from(commonInstr).sort((a, b) => a - b);

  for (const instr of compareInstr) {
    const ourEntry = ourByInstr.get(instr)!;
    const mameEntry = mameByInstr.get(instr)!;

    // Check for mismatches
    let mismatch = false;
    let mismatchReason = '';

    if (ourEntry.pc !== mameEntry.pc) {
      mismatch = true;
      mismatchReason = `PC mismatch: ours=${ourEntry.pc.toString(16)} vs mame=${mameEntry.pc.toString(16)}`;
      detailCounts.pcMismatch++;
    } else {
      // Compare registers
      const regCmp = compareRegisters(ourEntry, mameEntry);
      if (!regCmp.match) {
        mismatch = true;
        mismatchReason = `registers mismatch: ${regCmp.differences.slice(0, 3).join(', ')}`;
        detailCounts.registersMismatch++;
      }
    }

    if (mismatch) {
      divergenceCount++;
      if (!firstDivergence) {
        firstDivergence = {
          instructionNumber: instr,
          ourEntry,
          mameEntry,
          reason: mismatchReason
        };
      }
    } else {
      matchCount++;
    }
  }

  // Check for trace length mismatch
  if (ourInstr.size !== mameInstr.size) {
    if (!firstDivergence) {
      firstDivergence = {
        reason: `Trace length mismatch: ours=${ourInstr.size} total instructions vs mame=${mameInstr.size} total instructions`
      };
      detailCounts.otherMismatch++;
    }
  }

  const totalComparisons = compareInstr.length;
  const divergenceRate = totalComparisons > 0 ? divergenceCount / totalComparisons : 0;

  let severity: ComparisonResult['severity'] = 'NONE';
  if (divergenceRate === 0) {
    severity = 'NONE';
  } else if (divergenceRate < 0.001) {
    severity = 'LOW';
  } else if (divergenceRate < 0.01) {
    severity = 'MEDIUM';
  } else if (divergenceRate < 0.1) {
    severity = 'HIGH';
  } else {
    severity = 'CRITICAL';
  }

  return {
    game: gameName,
    ourTraceFile: `artifacts/${gameName}_trace.json`,
    mameTraceFile: `artifacts/mame_traces/${gameName}_mame.json`,
    totalFrames: Math.floor(totalComparisons / 250), // Rough estimate
    totalInstructions: totalComparisons,
    matchCount,
    divergenceCount,
    divergenceRate,
    firstDivergence,
    details: detailCounts,
    severity
  };
};

const main = async (): Promise<void> => {
  const games = ['wonderboy', 'alexkidd', 'sonic'];
  const results: ComparisonResult[] = [];

  for (const game of games) {
    const ourTraceFile = `/Users/mattias800/temp/ai-sms-gpt5/artifacts/${game}_trace.json`;
    const mameTraceFile = `/Users/mattias800/temp/ai-sms-gpt5/artifacts/mame_traces/${game}_mame.json`;

    if (!fs.existsSync(ourTraceFile) || !fs.existsSync(mameTraceFile)) {
      console.warn(`⚠️  Skipping ${game}: missing trace files`);
      continue;
    }

    console.log(`📊 Comparing ${game}...`);

    try {
      const ourTrace = loadTrace(ourTraceFile);
      const mameTrace = loadTrace(mameTraceFile);

      const result = compareTraces(ourTrace, mameTrace, game);
      results.push(result);

      console.log(`✅ ${game}: ${result.matchCount}/${result.totalInstructions} match`);
      if (result.firstDivergence) {
        console.log(`   ⚠️  First divergence: ${result.firstDivergence.reason}`);
      }
    } catch (error) {
      console.error(`❌ Error comparing ${game}:`, error instanceof Error ? error.message : String(error));
    }
  }

  // Write results to file
  const reportPath = '/Users/mattias800/temp/ai-sms-gpt5/PHASE_5_MAME_COMPARISON.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results written to ${reportPath}`);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('MAME TRACE COMPARISON SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    const matchPct = result.totalInstructions > 0
      ? ((result.matchCount / result.totalInstructions) * 100).toFixed(2)
      : '0.00';

    console.log(`\n${result.game.toUpperCase()}`);
    console.log(`  Severity: ${result.severity}`);
    console.log(`  Match Rate: ${matchPct}% (${result.matchCount}/${result.totalInstructions})`);
    console.log(`  Divergences: ${result.divergenceCount}`);

    if (result.firstDivergence) {
      console.log(`  First Issue: ${result.firstDivergence.reason}`);
      if (result.firstDivergence.ourEntry) {
        console.log(`    Our Entry: PC=${result.firstDivergence.ourEntry.pc.toString(16)}`);
      }
      if (result.firstDivergence.mameEntry) {
        console.log(`    MAME Entry: PC=${result.firstDivergence.mameEntry.pc.toString(16)}`);
      }
    } else {
      console.log(`  ✅ PERFECT MATCH`);
    }
  }

  console.log('\n' + '='.repeat(60));
};

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
