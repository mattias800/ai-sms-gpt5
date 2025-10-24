import * as fs from 'fs';

interface TraceEntry {
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
  totalComparisons: number;
  matchCount: number;
  pcMismatchCount: number;
  regMismatchCount: number;
  notes: string[];
  pcMismatches: Array<{
    instruction: number;
    ourPC: number;
    mamePC: number;
  }>;
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const loadTrace = (filePath: string): TraceEntry[] => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : data.trace || [];
};

const compareTraces = (ourTrace: TraceEntry[], mameTrace: TraceEntry[], gameName: string): ComparisonResult => {
  const result: ComparisonResult = {
    game: gameName,
    totalComparisons: 0,
    matchCount: 0,
    pcMismatchCount: 0,
    regMismatchCount: 0,
    notes: [],
    pcMismatches: [],
    severity: 'NONE'
  };

  // Create maps by instruction number for easy lookup
  const ourByInstr = new Map<number, TraceEntry>();
  const mameByInstr = new Map<number, TraceEntry>();

  for (const entry of ourTrace) {
    ourByInstr.set(entry.instruction, entry);
  }
  for (const entry of mameTrace) {
    mameByInstr.set(entry.instruction, entry);
  }

  // Find common instruction range (limit to first 5000 like MAME)
  const maxInstr = Math.min(5000, Math.max(...Array.from(ourByInstr.keys()), ...Array.from(mameByInstr.keys())));

  let firstMismatchInstr = -1;

  for (let instr = 0; instr <= maxInstr; instr++) {
    const ourEntry = ourByInstr.get(instr);
    const mameEntry = mameByInstr.get(instr);

    if (!ourEntry || !mameEntry) {
      if (firstMismatchInstr === -1 && (!ourEntry || !mameEntry)) {
        firstMismatchInstr = instr;
      }
      continue;
    }

    result.totalComparisons++;

    // Compare PC
    if (ourEntry.pc !== mameEntry.pc) {
      result.pcMismatchCount++;
      if (result.pcMismatches.length < 100) {
        result.pcMismatches.push({
          instruction: instr,
          ourPC: ourEntry.pc,
          mamePC: mameEntry.pc
        });
      }
    } else {
      result.matchCount++;
    }
  }

  // Calculate severity
  if (result.totalComparisons === 0) {
    result.severity = 'CRITICAL';
    result.notes.push('No common instructions found between traces');
  } else {
    const mismatchRate = result.pcMismatchCount / result.totalComparisons;
    if (mismatchRate === 0) {
      result.severity = 'NONE';
      result.notes.push('✅ PERFECT MATCH - All compared instructions match');
    } else if (mismatchRate < 0.001) {
      result.severity = 'LOW';
      result.notes.push('✅ EXCELLENT - Very few mismatches');
    } else if (mismatchRate < 0.01) {
      result.severity = 'MEDIUM';
      result.notes.push('⚠️ ACCEPTABLE - Some mismatches, investigate first mismatch');
    } else if (mismatchRate < 0.1) {
      result.severity = 'HIGH';
      result.notes.push('❌ CONCERNING - Many mismatches detected');
    } else {
      result.severity = 'CRITICAL';
      result.notes.push('❌ CRITICAL - Widespread mismatches');
    }
  }

  if (firstMismatchInstr !== -1) {
    result.notes.push(`First comparison issue at instruction ${firstMismatchInstr}`);
  }

  result.notes.push(
    `Compared ${result.totalComparisons} common instructions (up to instruction ${maxInstr})`
  );

  return result;
};

const main = async (): Promise<void> => {
  const games = ['wonderboy', 'alexkidd', 'sonic'];
  const results: ComparisonResult[] = [];

  console.log('MAME TRACE COMPARISON (CORRECTED - Using Instruction Numbers)');
  console.log('='.repeat(65));
  console.log();

  for (const game of games) {
    const ourTraceFile = `/Users/mattias800/temp/ai-sms-gpt5/artifacts/${game}_trace.json`;
    const mameTraceFile = `/Users/mattias800/temp/ai-sms-gpt5/artifacts/mame_traces/${game}_mame.json`;

    if (!fs.existsSync(ourTraceFile) || !fs.existsSync(mameTraceFile)) {
      console.warn(`⚠️  Skipping ${game}: missing trace files`);
      continue;
    }

    console.log(`📊 Comparing ${game.toUpperCase()}...`);

    try {
      const ourTrace = loadTrace(ourTraceFile);
      const mameTrace = loadTrace(mameTraceFile);

      const result = compareTraces(ourTrace, mameTrace, game);
      results.push(result);

      console.log(`  Severity: ${result.severity}`);
      console.log(`  Match Rate: ${((result.matchCount / result.totalComparisons) * 100).toFixed(2)}% (${result.matchCount}/${result.totalComparisons})`);
      console.log(`  PC Mismatches: ${result.pcMismatchCount}`);

      for (const note of result.notes) {
        console.log(`  ${note}`);
      }

      if (result.pcMismatches.length > 0) {
        console.log(`  First 5 mismatches:`);
        for (const mismatch of result.pcMismatches.slice(0, 5)) {
          console.log(
            `    Instr ${mismatch.instruction}: Our PC=0x${mismatch.ourPC.toString(16).padStart(4, '0')} vs MAME=0x${mismatch.mamePC.toString(16).padStart(4, '0')}`
          );
        }
      }
      console.log();
    } catch (error) {
      console.error(`❌ Error comparing ${game}:`, error instanceof Error ? error.message : String(error));
    }
  }

  // Write results to file
  const reportPath = '/Users/mattias800/temp/ai-sms-gpt5/PHASE_5_MAME_COMPARISON_CORRECTED.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results written to ${reportPath}`);

  // Print summary
  console.log('\n' + '='.repeat(65));
  console.log('SUMMARY');
  console.log('='.repeat(65));

  for (const result of results) {
    const status = result.severity === 'NONE' ? '✅' : result.severity === 'LOW' ? '✓' : '⚠️';
    console.log(`\n${status} ${result.game.toUpperCase()}: ${result.severity}`);
    if (result.matchCount === result.totalComparisons) {
      console.log(`   PERFECT MATCH: All ${result.totalComparisons} instructions match!`);
    } else {
      console.log(
        `   Match Rate: ${((result.matchCount / result.totalComparisons) * 100).toFixed(2)}% (${result.matchCount}/${result.totalComparisons})`
      );
      console.log(`   Divergences: ${result.pcMismatchCount}`);
    }
  }

  console.log('\n' + '='.repeat(65));
};

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
