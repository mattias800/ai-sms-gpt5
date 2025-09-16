#!/usr/bin/env npx tsx
import { createMachine } from '../src/machine/machine.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { Cartridge } from '../src/bus/bus.js';

interface BenchmarkResult {
  name: string;
  duration: number;
  operations: number;
  opsPerSecond: number;
  cyclesEmulated?: number;
  mhz?: number;
}

class EmulatorBenchmark {
  private results: BenchmarkResult[] = [];
  
  private createTestRom(size: number = 0x4000): Cartridge {
    const rom = new Uint8Array(size);
    let addr = 0;
    
    // Simple test program with various instructions
    rom[addr++] = 0x00; // NOP
    rom[addr++] = 0x3E; // LD A,n
    rom[addr++] = 0x42;
    rom[addr++] = 0x47; // LD B,A
    rom[addr++] = 0x4F; // LD C,A
    rom[addr++] = 0x57; // LD D,A
    rom[addr++] = 0x5F; // LD E,A
    rom[addr++] = 0x67; // LD H,A
    rom[addr++] = 0x6F; // LD L,A
    rom[addr++] = 0x09; // ADD HL,BC
    rom[addr++] = 0x19; // ADD HL,DE
    rom[addr++] = 0x29; // ADD HL,HL
    rom[addr++] = 0x03; // INC BC
    rom[addr++] = 0x13; // INC DE
    rom[addr++] = 0x23; // INC HL
    rom[addr++] = 0x33; // INC SP
    rom[addr++] = 0x18; // JR
    rom[addr++] = 0xEE; // -18 (loop back)
    
    return { rom };
  }

  async runBenchmark(name: string, testFn: () => void | Promise<void>, operations: number): Promise<BenchmarkResult> {
    console.log(`Running: ${name}...`);
    
    // Warmup
    for (let i = 0; i < 10; i++) {
      await testFn();
    }
    
    // Actual benchmark
    const startTime = performance.now();
    
    for (let i = 0; i < operations; i++) {
      await testFn();
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const opsPerSecond = (operations / duration) * 1000;
    
    return {
      name,
      duration,
      operations,
      opsPerSecond
    };
  }

  async benchmarkCPU(): Promise<void> {
    console.log('\n📊 CPU Performance Benchmark\n');
    
    const cart = this.createTestRom();
    const m = createMachine({ cart,  });
    const cpu = m.getCPU();
    
    // Benchmark single instruction execution
    const singleInst = await this.runBenchmark(
      'Single Instruction',
      () => cpu.stepOne(),
      100000
    );
    this.results.push(singleInst);
    
    // Benchmark block execution
    const m2 = createMachine({ cart,  });
    const cpu2 = m2.getCPU();
    
    const blockExec = await this.runBenchmark(
      'Block Execution',
      () => {
        for (let i = 0; i < 100; i++) {
          cpu2.stepOne();
        }
      },
      1000
    );
    this.results.push(blockExec);
    
    // Benchmark full frame execution
    const frameResult = await this.benchmarkFrame();
    this.results.push(frameResult);
  }

  async benchmarkFrame(): Promise<BenchmarkResult> {
    const cart = this.createTestRom();
    const m = createMachine({ cart,  });
    const cpu = m.getCPU();
    const vdp = m.getVDP();
    
    const CYCLES_PER_FRAME = 59736;
    let totalCycles = 0;
    let frames = 0;
    
    const startTime = performance.now();
    
    // Run for 100 frames
    while (frames < 100) {
      let cyclesInFrame = 0;
      while (cyclesInFrame < CYCLES_PER_FRAME) {
        const result = cpu.stepOne();
        cyclesInFrame += result.cycles;
        vdp.tickCycles(result.cycles);
        
        if (vdp.hasIRQ()) {
          cpu.requestIRQ();
        }
      }
      totalCycles += cyclesInFrame;
      frames++;
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    const fps = (frames / duration) * 1000;
    const mhz = (totalCycles / duration) / 1000; // MHz
    
    return {
      name: 'Frame Execution',
      duration,
      operations: frames,
      opsPerSecond: fps,
      cyclesEmulated: totalCycles,
      mhz
    };
  }

  async benchmarkMemory(): Promise<void> {
    console.log('\n💾 Memory Access Benchmark\n');
    
    const cart: Cartridge = { rom: new Uint8Array(256 * 1024) };
    const m = createMachine({ cart,  });
    const bus = m.getBus();
    
    // Benchmark reads
    const readResult = await this.runBenchmark(
      'Memory Reads',
      () => {
        for (let i = 0; i < 1000; i++) {
          bus.read8((i * 17) & 0xFFFF);
        }
      },
      1000
    );
    this.results.push(readResult);
    
    // Benchmark writes
    const writeResult = await this.runBenchmark(
      'Memory Writes',
      () => {
        for (let i = 0; i < 1000; i++) {
          bus.write8(0xC000 + (i & 0x1FFF), i & 0xFF);
        }
      },
      1000
    );
    this.results.push(writeResult);
    
    // Benchmark banking
    const bankResult = await this.runBenchmark(
      'Bank Switching',
      () => {
        for (let i = 0; i < 16; i++) {
          bus.write8(0xFFFD, i);
          bus.write8(0xFFFE, i);
          bus.read8(0x4000);
          bus.read8(0x8000);
        }
      },
      1000
    );
    this.results.push(bankResult);
  }

  async benchmarkVDP(): Promise<void> {
    console.log('\n🎨 VDP Performance Benchmark\n');
    
    const cart: Cartridge = { rom: new Uint8Array(0x4000) };
    const m = createMachine({ cart,  });
    const vdp = m.getVDP();
    
    // Benchmark VRAM writes
    const vramResult = await this.runBenchmark(
      'VRAM Writes',
      () => {
        vdp.writePort(0xBF, 0x00);
        vdp.writePort(0xBF, 0x40);
        for (let i = 0; i < 256; i++) {
          vdp.writePort(0xBE, i & 0xFF);
        }
      },
      1000
    );
    this.results.push(vramResult);
    
    // Benchmark rendering
    const renderResult = await this.runBenchmark(
      'Frame Rendering',
      () => {
        for (let i = 0; i < 59736; i += 228) {
          vdp.tickCycles(228);
        }
        // Render frame (getState includes rendering logic)
        vdp.getState();
      },
      100
    );
    this.results.push(renderResult);
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(2);
  }

  private printResults(): void {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('                     BENCHMARK RESULTS');
    console.log('═'.repeat(70));
    console.log();
    
    const maxNameLen = Math.max(...this.results.map(r => r.name.length));
    
    this.results.forEach(result => {
      const name = result.name.padEnd(maxNameLen + 2);
      const ops = this.formatNumber(result.opsPerSecond).padStart(10);
      const time = `${result.duration.toFixed(2)}ms`.padStart(10);
      
      console.log(`${name} │ ${ops} ops/s │ ${time}`);
      
      if (result.mhz !== undefined) {
        console.log(`${''.padEnd(maxNameLen + 2)} │ ${result.mhz.toFixed(2)} MHz emulated`);
      }
    });
    
    console.log('─'.repeat(70));
    
    // Performance analysis
    const frameResult = this.results.find(r => r.name === 'Frame Execution');
    if (frameResult && frameResult.opsPerSecond) {
      const fps = frameResult.opsPerSecond;
      const targetFPS = 60;
      const performance = (fps / targetFPS) * 100;
      
      console.log(`\n📈 Performance Analysis:`);
      console.log(`   FPS: ${fps.toFixed(1)} (${performance.toFixed(1)}% of target 60 FPS)`);
      
      if (frameResult.mhz) {
        const targetMHz = 3.58;
        const cpuPerf = (frameResult.mhz / targetMHz) * 100;
        console.log(`   CPU: ${frameResult.mhz.toFixed(2)} MHz (${cpuPerf.toFixed(1)}% of target 3.58 MHz)`);
      }
      
      if (performance >= 100) {
        console.log(`   ✅ Full speed emulation achieved!`);
      } else if (performance >= 90) {
        console.log(`   ⚠️  Nearly full speed (${(100 - performance).toFixed(1)}% below target)`);
      } else {
        console.log(`   ❌ Below full speed (${(100 - performance).toFixed(1)}% below target)`);
      }
    }
    
    // Save results
    const resultsPath = 'benchmark-results.json';
    const data = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version
      },
      results: this.results
    };
    
    writeFileSync(resultsPath, JSON.stringify(data, null, 2));
    console.log(`\n📄 Results saved to: ${resultsPath}`);
  }

  async runAll(): Promise<void> {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║     SMS Emulator Performance Benchmark          ║');
    console.log('╚══════════════════════════════════════════════════╝');
    
    await this.benchmarkCPU();
    await this.benchmarkMemory();
    await this.benchmarkVDP();
    
    this.printResults();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new EmulatorBenchmark();
  benchmark.runAll().catch(console.error);
}

export { EmulatorBenchmark };
