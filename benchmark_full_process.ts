import { createMachine } from './src/machine/machine';
import { readFileSync, writeFileSync } from 'fs';
import { PNG } from 'pngjs';
import { writePNGUltraFast } from './utils/fast_png';

console.log('Benchmarking full process to find bottlenecks');

const run = async () => {
  try {
    console.log(`\n=== Full Process Benchmark ===`);
    
    // Step 1: File loading
    console.log(`1. Loading ROM and BIOS files...`);
    const startLoad = performance.now();
    const romData = readFileSync('./sonic.sms');
    const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
    const endLoad = performance.now();
    const loadTime = endLoad - startLoad;
    console.log(`   File loading: ${loadTime.toFixed(2)}ms`);
    
    // Step 2: Machine creation
    console.log(`\n2. Creating machine...`);
    const startCreate = performance.now();
    const machine = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });
    const endCreate = performance.now();
    const createTime = endCreate - startCreate;
    console.log(`   Machine creation: ${createTime.toFixed(2)}ms`);
    
    // Step 3: Emulation
    console.log(`\n3. Running emulation...`);
    const startEmu = performance.now();
    const cyclesPerFrame = 60000; // NTSC
    const totalCycles = 1000 * cyclesPerFrame;
    machine.runCycles(totalCycles);
    const endEmu = performance.now();
    const emuTime = endEmu - startEmu;
    console.log(`   Emulation (1000 frames): ${emuTime.toFixed(2)}ms`);
    
    // Step 4: Frame buffer generation
    console.log(`\n4. Generating frame buffer...`);
    const startFrame = performance.now();
    const vdp = machine.getVDP();
    const frameBuffer = vdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
    const endFrame = performance.now();
    const frameTime = endFrame - startFrame;
    console.log(`   Frame buffer generation: ${frameTime.toFixed(2)}ms`);
    
    // Step 5: PNG generation (original)
    console.log(`\n5. PNG generation (original method)...`);
    const startPng1 = performance.now();
    const width = 256;
    const height = 192;
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
    const endPng1 = performance.now();
    const pngTime1 = endPng1 - startPng1;
    console.log(`   PNG generation (original): ${pngTime1.toFixed(2)}ms`);
    
    // Step 6: PNG generation (optimized)
    console.log(`\n6. PNG generation (optimized method)...`);
    const startPng2 = performance.now();
    writePNGUltraFast(frameBuffer, width, height, 'traces/sonic_optimized.png');
    const endPng2 = performance.now();
    const pngTime2 = endPng2 - startPng2;
    console.log(`   PNG generation (optimized): ${pngTime2.toFixed(2)}ms`);
    
    // Step 7: File writing
    console.log(`\n7. File writing...`);
    const startWrite = performance.now();
    writeFileSync('traces/sonic_original.png', buffer1);
    const endWrite = performance.now();
    const writeTime = endWrite - startWrite;
    console.log(`   File writing: ${writeTime.toFixed(2)}ms`);
    
    // Summary
    const totalTime = loadTime + createTime + emuTime + frameTime + pngTime1 + writeTime;
    const optimizedTime = loadTime + createTime + emuTime + frameTime + pngTime2 + writeTime;
    const improvement = totalTime - optimizedTime;
    
    console.log(`\n=== Summary ===`);
    console.log(`Total time (original): ${totalTime.toFixed(2)}ms`);
    console.log(`Total time (optimized): ${optimizedTime.toFixed(2)}ms`);
    console.log(`Improvement: ${improvement.toFixed(2)}ms`);
    
    console.log(`\n=== Breakdown ===`);
    console.log(`File loading: ${loadTime.toFixed(2)}ms (${(loadTime/totalTime*100).toFixed(1)}%)`);
    console.log(`Machine creation: ${createTime.toFixed(2)}ms (${(createTime/totalTime*100).toFixed(1)}%)`);
    console.log(`Emulation: ${emuTime.toFixed(2)}ms (${(emuTime/totalTime*100).toFixed(1)}%)`);
    console.log(`Frame buffer: ${frameTime.toFixed(2)}ms (${(frameTime/totalTime*100).toFixed(1)}%)`);
    console.log(`PNG generation: ${pngTime1.toFixed(2)}ms (${(pngTime1/totalTime*100).toFixed(1)}%)`);
    console.log(`File writing: ${writeTime.toFixed(2)}ms (${(writeTime/totalTime*100).toFixed(1)}%)`);
    
    // Recommendations
    console.log(`\n=== Recommendations ===`);
    if (emuTime > totalTime * 0.5) {
      console.log(`🎯 Main bottleneck: Emulation (${(emuTime/totalTime*100).toFixed(1)}%)`);
      console.log(`   Consider reducing frame count or optimizing emulation`);
    } else if (pngTime1 > totalTime * 0.3) {
      console.log(`🎯 Main bottleneck: PNG generation (${(pngTime1/totalTime*100).toFixed(1)}%)`);
      console.log(`   Use optimized PNG generation`);
    } else if (loadTime > totalTime * 0.2) {
      console.log(`🎯 Main bottleneck: File loading (${(loadTime/totalTime*100).toFixed(1)}%)`);
      console.log(`   Consider caching ROM/BIOS data`);
    } else {
      console.log(`✅ No single major bottleneck found`);
      console.log(`   Process is well balanced`);
    }
    
    if (improvement > 1000) {
      console.log(`✅ PNG optimization saves ${improvement.toFixed(0)}ms (over 1 second!)`);
    } else {
      console.log(`⚠️  PNG optimization saves only ${improvement.toFixed(0)}ms`);
      console.log(`   Need to optimize other parts for 1+ second improvement`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
