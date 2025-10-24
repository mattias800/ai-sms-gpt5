import { createMachine } from './src/machine/machine';
import { readFileSync } from 'fs';
import { writePNGUltraFast } from './utils/fast_png';

console.log('Finding the earliest frame where Sonic title screen appears');

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

    // Test frames from 200 to 1000 in steps of 50
    const testFrames = [];
    for (let i = 200; i <= 1000; i += 50) {
      testFrames.push(i);
    }
    
    console.log(`Testing frames: ${testFrames.join(', ')}`);
    
    let bestFrame = 1000;
    let bestScore = 0;
    const results: Array<{frame: number, colors: number, brightColors: number, score: number}> = [];
    
    for (const frame of testFrames) {
      console.log(`\n=== Testing Frame ${frame} ===`);
      
      // Reset machine for each test
      const testMachine = createMachine({
        cart: {
          rom: romData,
        },
        bus: {
          bios: biosData,
        },
      });
      
      // Run to this frame
      const cyclesPerFrame = 60000; // NTSC
      const totalCycles = frame * cyclesPerFrame;
      testMachine.runCycles(totalCycles);
      
      const vdp = testMachine.getVDP();
      const frameBuffer = vdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
      
      // Analyze colors
      const colorMap = new Map<string, number>();
      
      for (let y = 0; y < 192; y++) {
        for (let x = 0; x < 256; x++) {
          const idx = (y * 256 + x) * 3;
          const r = frameBuffer[idx] ?? 0;
          const g = frameBuffer[idx + 1] ?? 0;
          const b = frameBuffer[idx + 2] ?? 0;
          const colorKey = `${r},${g},${b}`;
          colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
        }
      }
      
      // Count bright colors (potential sprites)
      const brightColors = Array.from(colorMap.entries())
        .filter(([colorKey, count]) => {
          const [r, g, b] = colorKey.split(',').map(Number);
          return (r > 150 || g > 150 || b > 150) && count < 1000 && count > 10;
        });
      
      // Score based on color diversity and sprite presence
      const totalColors = colorMap.size;
      const spriteColors = brightColors.length;
      const score = totalColors + (spriteColors * 2); // Weight sprite colors more
      
      results.push({frame, colors: totalColors, brightColors: spriteColors, score});
      
      console.log(`  Total colors: ${totalColors}`);
      console.log(`  Bright colors: ${spriteColors}`);
      console.log(`  Score: ${score}`);
      
      // Check if this looks like a good title screen
      if (totalColors >= 10 && spriteColors >= 5) {
        console.log(`  ✅ Looks like title screen!`);
        if (score > bestScore) {
          bestScore = score;
          bestFrame = frame;
        }
      } else if (totalColors < 5) {
        console.log(`  ❌ Too few colors (likely BIOS or loading)`);
      } else {
        console.log(`  ⚠️  Some colors but not title screen yet`);
      }
    }
    
    // Sort results by score
    results.sort((a, b) => b.score - a.score);
    
    console.log(`\n=== Results Summary ===`);
    console.log(`Best frame: ${bestFrame} (score: ${bestScore})`);
    console.log(`\nTop 5 frames:`);
    results.slice(0, 5).forEach((result, i) => {
      console.log(`  ${i + 1}. Frame ${result.frame}: ${result.colors} colors, ${result.brightColors} sprites (score: ${result.score})`);
    });
    
    // Test the best frame with full rendering
    console.log(`\n=== Rendering Best Frame ${bestFrame} ===`);
    const finalMachine = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });
    
    const cyclesPerFrame = 60000; // NTSC
    const finalCycles = bestFrame * cyclesPerFrame;
    finalMachine.runCycles(finalCycles);
    
    const finalVdp = finalMachine.getVDP();
    const finalFrameBuffer = finalVdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
    
    // Generate PNG
    writePNGUltraFast(finalFrameBuffer, 256, 192, `traces/sonic_frame_${bestFrame}_optimized.png`);
    console.log(`📸 Screenshot saved: traces/sonic_frame_${bestFrame}_optimized.png`);
    
    // Final analysis
    const finalColorMap = new Map<string, number>();
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 3;
        const r = finalFrameBuffer[idx] ?? 0;
        const g = finalFrameBuffer[idx + 1] ?? 0;
        const b = finalFrameBuffer[idx + 2] ?? 0;
        const colorKey = `${r},${g},${b}`;
        finalColorMap.set(colorKey, (finalColorMap.get(colorKey) ?? 0) + 1);
      }
    }
    
    const finalBrightColors = Array.from(finalColorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        return (r > 150 || g > 150 || b > 150) && count < 1000 && count > 10;
      });
    
    console.log(`\n=== Final Assessment ===`);
    console.log(`Frame ${bestFrame} shows:`);
    console.log(`- Total colors: ${finalColorMap.size}`);
    console.log(`- Bright sprite colors: ${finalBrightColors.length}`);
    console.log(`- Time saved: ${1000 - bestFrame} frames (${((1000 - bestFrame) * 60).toFixed(0)}ms)`);
    
    if (finalBrightColors.length >= 5) {
      console.log(`✅ Sonic's hands should be visible at frame ${bestFrame}!`);
      console.log(`⚡ Optimized: ${bestFrame} frames instead of 1000 (${((1000 - bestFrame) * 60).toFixed(0)}ms faster)`);
    } else {
      console.log(`❌ Frame ${bestFrame} doesn't show sprites yet`);
      console.log(`   Need to use frame 1000 or later`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
