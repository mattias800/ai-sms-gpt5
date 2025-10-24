import { createMachine } from './src/machine/machine';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { writePNGFast, writePNGUltraFast } from './utils/fast_png';

console.log('Benchmarking PNG generation speed');

const run = async () => {
  try {
    // Load ROM and BIOS files
    const romData = readFileSync('./sonic.sms');
    const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
    
    const machine = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });

    // Run for 1000 frames
    const cyclesPerFrame = 60000; // NTSC
    const totalCycles = 1000 * cyclesPerFrame;
    machine.runCycles(totalCycles);

    const vdp = machine.getVDP();
    
    // Get frame buffer
    const frameBuffer = vdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
    const width = 256;
    const height = 192;
    
    console.log(`\n=== PNG Generation Speed Test ===`);
    console.log(`Frame buffer size: ${frameBuffer.length} bytes`);
    console.log(`Image dimensions: ${width}x${height}`);
    
    // Test 1: Original method
    console.log(`\n1. Testing original PNG.sync.write method...`);
    const start1 = performance.now();
    
    const png1 = new PNG({ width, height });
    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * 3;
      const dstIdx = i * 4;
      png1.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
      png1.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
      png1.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
      png1.data[dstIdx + 3] = 255;
    }
    const buffer1 = PNG.sync.write(png1);
    const end1 = performance.now();
    const time1 = end1 - start1;
    
    console.log(`   Original method: ${time1.toFixed(2)}ms`);
    
    // Test 2: Fast method
    console.log(`\n2. Testing fast PNG method...`);
    const start2 = performance.now();
    writePNGFast(frameBuffer, width, height, 'traces/sonic_fast.png');
    const end2 = performance.now();
    const time2 = end2 - start2;
    
    console.log(`   Fast method: ${time2.toFixed(2)}ms`);
    
    // Test 3: Ultra fast method
    console.log(`\n3. Testing ultra fast PNG method...`);
    const start3 = performance.now();
    writePNGUltraFast(frameBuffer, width, height, 'traces/sonic_ultra_fast.png');
    const end3 = performance.now();
    const time3 = end3 - start3;
    
    console.log(`   Ultra fast method: ${time3.toFixed(2)}ms`);
    
    // Calculate improvements
    const improvement1 = ((time1 - time2) / time1 * 100).toFixed(1);
    const improvement2 = ((time1 - time3) / time1 * 100).toFixed(1);
    
    console.log(`\n=== Results ===`);
    console.log(`Original method: ${time1.toFixed(2)}ms`);
    console.log(`Fast method: ${time2.toFixed(2)}ms (${improvement1}% faster)`);
    console.log(`Ultra fast method: ${time3.toFixed(2)}ms (${improvement2}% faster)`);
    
    // Check file sizes
    const { statSync } = require('fs');
    const size1 = statSync('traces/sonic_fast.png').size;
    const size2 = statSync('traces/sonic_ultra_fast.png').size;
    
    console.log(`\n=== File Sizes ===`);
    console.log(`Fast PNG: ${size1} bytes`);
    console.log(`Ultra fast PNG: ${size2} bytes`);
    console.log(`Size difference: ${size2 - size1} bytes (${((size2 - size1) / size1 * 100).toFixed(1)}% larger)`);
    
    // Recommendation
    console.log(`\n=== Recommendation ===`);
    if (time3 < time1 - 1000) {
      console.log(`✅ Ultra fast method saves ${(time1 - time3).toFixed(0)}ms (over 1 second faster!)`);
      console.log(`   Use writePNGUltraFast() for maximum speed`);
    } else if (time2 < time1 - 1000) {
      console.log(`✅ Fast method saves ${(time1 - time2).toFixed(0)}ms (over 1 second faster!)`);
      console.log(`   Use writePNGFast() for good speed with reasonable file size`);
    } else {
      console.log(`⚠️  Speed improvement is less than 1 second`);
      console.log(`   Consider other optimizations`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
