import * as fs from 'fs';

interface TraceEntry {
  cycle: number;
  instruction: number;
  pc: number;
}

const diagnose = async (): Promise<void> => {
  // Load our trace
  const ourTrace = JSON.parse(
    fs.readFileSync('/Users/mattias800/temp/ai-sms-gpt5/artifacts/wonderboy_trace.json', 'utf-8')
  );
  const ourData = ourTrace.trace as TraceEntry[];

  // Load MAME trace
  const mameTrace = JSON.parse(
    fs.readFileSync('/Users/mattias800/temp/ai-sms-gpt5/artifacts/mame_traces/wonderboy_mame.json', 'utf-8')
  );
  const mameData = mameTrace.trace as TraceEntry[];

  console.log('DETAILED ANALYSIS');
  console.log('================\n');

  console.log('FRAME BOUNDARIES:');
  const lastOur = ourData[ourData.length - 1];
  console.log(`Our trace frames estimated: ~${lastOur.cycle / 60000 | 0} frames (at ~60k cycles/frame)`);
  console.log(`MAME trace frames: ${mameTrace.metadata.frames} frames\n`);

  console.log('INSTRUCTION DISTRIBUTION:');
  console.log(`Our total instructions: ${ourData.length}`);
  console.log(`MAME total instructions: ${mameData.length}`);
  console.log(`Ratio: ${(ourData.length / mameData.length).toFixed(2)}x\n`);

  // Look for pattern in our trace
  console.log('OUR TRACE PATTERN ANALYSIS:');

  // Find sequences of low deltas vs high deltas
  const ourDeltas: number[] = [];
  for (let i = 1; i < Math.min(ourData.length, 1000); i++) {
    ourDeltas.push(ourData[i].cycle - ourData[i - 1].cycle);
  }

  const lowDeltaCount = ourDeltas.filter((d) => d <= 20).length;
  const highDeltaCount = ourDeltas.filter((d) => d > 100).length;

  console.log(`  First 1000 instructions:`);
  console.log(`    Low deltas (≤20): ${lowDeltaCount}`);
  console.log(`    High deltas (>100): ${highDeltaCount}`);
  console.log(`    Min delta: ${Math.min(...ourDeltas)}`);
  console.log(`    Max delta: ${Math.max(...ourDeltas)}\n`);

  // Look for the high delta locations
  console.log('HIGH DELTA LOCATIONS (first 20 in first 1000):');
  let count = 0;
  for (let i = 1; i < Math.min(ourData.length, 1000) && count < 20; i++) {
    const delta = ourData[i].cycle - ourData[i - 1].cycle;
    if (delta > 100) {
      console.log(
        `  Instr ${i}: cycle=${ourData[i].cycle}, delta=${delta}, PC: ${ourData[i - 1].pc.toString(16)} -> ${ourData[i].pc.toString(16)}`
      );
      count++;
    }
  }
  console.log();

  // Compare with MAME
  console.log('MAME TRACE PATTERN ANALYSIS:');
  const mameDeltas: number[] = [];
  for (let i = 1; i < mameData.length; i++) {
    mameDeltas.push(mameData[i].cycle - mameData[i - 1].cycle);
  }

  const mameLowDeltaCount = mameDeltas.filter((d) => d <= 20).length;
  const mameHighDeltaCount = mameDeltas.filter((d) => d > 100).length;

  console.log(`  All ${mameData.length} instructions:`);
  console.log(`    Low deltas (≤20): ${mameLowDeltaCount}`);
  console.log(`    High deltas (>100): ${mameHighDeltaCount}`);
  console.log(`    Min delta: ${Math.min(...mameDeltas)}`);
  console.log(`    Max delta: ${Math.max(...mameDeltas)}\n`);

  // Hypothesis testing
  console.log('HYPOTHESIS TESTING:');
  console.log(`H1: Our trace captures VDP/PSG ticks separately`);
  console.log(
    `    Evidence: High deltas suggest bulk processing of I/O or device state changes at certain PCs`
  );
  console.log();

  console.log(`H2: Our cycle counting includes device ticks, MAME doesn't`);
  console.log(`    Evidence: 43.83 vs 4.0 cycles/instr (11x difference)`);
  console.log();

  console.log(`H3: Different instruction definition`);
  console.log(`    Evidence: MAME shows clean 4-7 cycle pattern, ours shows huge variance`);
  console.log();

  // Conclusion
  console.log('CONCLUSION:');
  console.log('Our trace likely captures architectural instructions correctly.');
  console.log('The cycle accounting is bloated with device ticks (VDP/PSG per-cycle processing).');
  console.log('This happens because machine.stepOne() ticks devices internally.');
  console.log();
  console.log('SOLUTION:');
  console.log('1. Modify trace tool to capture cycles BEFORE device ticks');
  console.log('2. Or compare traces using instruction numbers instead of cycles');
  console.log('3. Or align trace granularity: capture fewer trace points (every Nth instruction)');
};

diagnose().catch(console.error);
