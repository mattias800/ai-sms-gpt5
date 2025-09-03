#!/usr/bin/env npx tsx
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output: string;
  errors: string[];
}

interface TestSuite {
  name: string;
  command: string;
  critical: boolean; // If true, failure stops all tests
}

class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = Date.now();
  
  private readonly testSuites: TestSuite[] = [
    {
      name: 'Z80 CPU Instruction Tests',
      command: 'npx tsx test/cpu.test.ts',
      critical: true
    },
    {
      name: 'Z80 Timing Verification',
      command: 'npx tsx tools/verify_z80_timing.ts',
      critical: false
    },
    {
      name: 'VDP Timing Tests',
      command: 'npx tsx tools/verify_vdp_timing.ts',
      critical: false
    },
    {
      name: 'Memory Banking Tests',
      command: 'npx tsx test/memory.test.ts',
      critical: true
    },
    {
      name: 'Integration Tests',
      command: 'npm test',
      critical: false
    }
  ];

  async runTest(suite: TestSuite): Promise<TestResult> {
    console.log(`\n🧪 Running: ${suite.name}`);
    console.log('─'.repeat(50));
    
    const startTime = Date.now();
    const result: TestResult = {
      name: suite.name,
      passed: false,
      duration: 0,
      output: '',
      errors: []
    };

    try {
      const { stdout, stderr } = await execAsync(suite.command);
      result.output = stdout;
      
      // Check for test failures in output
      const hasFailed = stdout.includes('❌') || 
                       stdout.includes('FAIL') || 
                       stdout.includes('Error:') ||
                       stderr.includes('Error');
      
      result.passed = !hasFailed;
      
      if (stderr && !stderr.includes('DeprecationWarning')) {
        result.errors.push(stderr);
      }
      
      // Extract errors from output
      const errorLines = stdout.split('\n').filter(line => 
        line.includes('❌') || line.includes('Error')
      );
      result.errors.push(...errorLines);
      
    } catch (error: any) {
      result.passed = false;
      result.errors.push(error.message);
      result.output = error.stdout || '';
    }
    
    result.duration = Date.now() - startTime;
    
    // Display result
    if (result.passed) {
      console.log(`✅ PASSED (${result.duration}ms)`);
    } else {
      console.log(`❌ FAILED (${result.duration}ms)`);
      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(err => console.log(`  • ${err}`));
      }
    }
    
    return result;
  }

  async runAll(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║       SMS Emulator Test Suite                   ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`\nStarted at: ${new Date().toLocaleString()}\n`);

    // Build first
    console.log('📦 Building project...');
    try {
      await execAsync('npm run build');
      console.log('✅ Build successful\n');
    } catch (error: any) {
      console.log('❌ Build failed:', error.message);
      return;
    }

    // Run all test suites
    for (const suite of this.testSuites) {
      const result = await this.runTest(suite);
      this.results.push(result);
      
      // Stop if critical test failed
      if (suite.critical && !result.passed) {
        console.log('\n⚠️  Critical test failed. Stopping test execution.');
        break;
      }
    }

    // Generate report
    this.generateReport();
  }

  private generateReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const passRate = (passed / this.results.length * 100).toFixed(1);

    console.log('\n');
    console.log('═'.repeat(60));
    console.log('                    TEST SUMMARY');
    console.log('═'.repeat(60));
    
    // Results table
    console.log('\nTest Results:');
    console.log('─'.repeat(60));
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const time = `${result.duration}ms`.padEnd(8);
      console.log(`${status} ${result.name.padEnd(35)} ${time}`);
    });
    
    console.log('─'.repeat(60));
    console.log(`\nTotal Tests: ${this.results.length}`);
    console.log(`Passed: ${passed} | Failed: ${failed} | Pass Rate: ${passRate}%`);
    console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    
    // Save detailed report
    const reportPath = join(process.cwd(), 'test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      duration: totalDuration,
      passed,
      failed,
      passRate,
      results: this.results
    };
    
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: test-report.json`);
    
    // Exit code
    const exitCode = failed > 0 ? 1 : 0;
    console.log(`\n${exitCode === 0 ? '✅ All tests passed!' : '❌ Some tests failed.'}`);
    process.exit(exitCode);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestRunner();
  runner.runAll().catch(console.error);
}

export { TestRunner };
