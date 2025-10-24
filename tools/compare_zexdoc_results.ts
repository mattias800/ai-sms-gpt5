#!/usr/bin/env tsx

/**
 * ZEXDOC Results Comparison Tool
 * 
 * Compares our ZEXDOC test results against MAME reference data.
 * Helps identify any CPU implementation divergences.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ZexdocResult {
  success: boolean;
  registers?: {
    [key: string]: number | boolean;
  };
  cycles: number;
  timestamp: string;
}

interface ComparisonReport {
  match: boolean;
  timestamp: string;
  differences: {
    [key: string]: {
      ours: number | boolean;
      reference: number | boolean;
    };
  };
  summary: string;
}

function compareResults(ours: ZexdocResult, reference: ZexdocResult): ComparisonReport {
  const differences: ComparisonReport['differences'] = {};
  let match = true;

  if (!ours.success) {
    return {
      match: false,
      timestamp: new Date().toISOString(),
      differences,
      summary: `Our run failed: ${(ours as any).reason || 'Unknown error'}`,
    };
  }

  if (!reference.success) {
    return {
      match: false,
      timestamp: new Date().toISOString(),
      differences,
      summary: `Reference run failed: ${(reference as any).reason || 'Unknown error'}`,
    };
  }

  // Compare registers
  if (ours.registers && reference.registers) {
    const ourRegs = ours.registers;
    const refRegs = reference.registers;

    const criticalRegs = ['pc', 'sp', 'a', 'f', 'b', 'c', 'd', 'e', 'h', 'l'];

    for (const reg of criticalRegs) {
      if (ourRegs[reg] !== refRegs[reg]) {
        differences[`reg_${reg}`] = {
          ours: ourRegs[reg],
          reference: refRegs[reg],
        };
        match = false;
      }
    }
  }

  // Compare cycles
  if (ours.cycles !== reference.cycles) {
    differences['cycles'] = {
      ours: ours.cycles,
      reference: reference.cycles,
    };
    match = false;
  }

  const summary = match
    ? '✓ PERFECT MATCH - All registers and cycles match MAME'
    : `✗ DIVERGENCE - ${Object.keys(differences).length} differences found`;

  return {
    match,
    timestamp: new Date().toISOString(),
    differences,
    summary,
  };
}

function formatDifference(key: string, diff: any): string {
  const ourVal = diff.ours;
  const refVal = diff.reference;

  if (typeof ourVal === 'number' && typeof refVal === 'number') {
    const ourHex = ourVal.toString(16).padStart(4, '0');
    const refHex = refVal.toString(16).padStart(4, '0');
    return `${key}: 0x${ourHex} (ours) vs 0x${refHex} (reference)`;
  }

  return `${key}: ${ourVal} (ours) vs ${refVal} (reference)`;
}

async function main(): Promise<void> {
  const ourResultPath = './artifacts/zexdoc_results.json';
  const refResultPath = process.env.ZEXDOC_MAME_REFERENCE || './artifacts/zexdoc_reference.json';

  console.log('ZEXDOC Results Comparison');
  console.log('=========================\n');

  // Load our results
  if (!fs.existsSync(ourResultPath)) {
    console.error(`✗ Our results not found: ${ourResultPath}`);
    console.error('  Run: npm run test:z80:zexdoc');
    process.exit(1);
  }

  const ourResults: ZexdocResult = JSON.parse(fs.readFileSync(ourResultPath, 'utf-8'));
  console.log(`✓ Loaded our results from: ${ourResultPath}`);
  console.log(`  Success: ${ourResults.success}, Cycles: ${ourResults.cycles.toLocaleString()}\n`);

  // Load reference results
  if (!fs.existsSync(refResultPath)) {
    console.warn(`⚠ Reference results not found: ${refResultPath}`);
    console.warn(`  To create reference data, run ZEXDOC in MAME and save results to: ${refResultPath}`);
    console.warn(`  Reference JSON format should match our format (see zexdoc_results.json)\n`);

    // Still create comparison report for documentation
    const report: ComparisonReport = {
      match: false,
      timestamp: new Date().toISOString(),
      differences: {},
      summary: 'Reference data not available - cannot perform comparison',
    };

    fs.writeFileSync('./artifacts/zexdoc_comparison.json', JSON.stringify(report, null, 2));
    console.log('Comparison report saved to: ./artifacts/zexdoc_comparison.json');
    process.exit(1);
  }

  const refResults: ZexdocResult = JSON.parse(fs.readFileSync(refResultPath, 'utf-8'));
  console.log(`✓ Loaded reference results from: ${refResultPath}`);
  console.log(`  Success: ${refResults.success}, Cycles: ${refResults.cycles.toLocaleString()}\n`);

  // Compare
  const report = compareResults(ourResults, refResults);

  console.log('Comparison Results:');
  console.log(report.summary);

  if (Object.keys(report.differences).length > 0) {
    console.log('\nDifferences Found:');
    for (const [key, diff] of Object.entries(report.differences)) {
      console.log(`  ${formatDifference(key, diff)}`);
    }
  } else if (report.match) {
    console.log('\n🎉 All checks passed! CPU implementation matches reference.');
  }

  // Save report
  fs.writeFileSync('./artifacts/zexdoc_comparison.json', JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ./artifacts/zexdoc_comparison.json`);

  process.exit(report.match ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
