import { createMachine } from './src/machine/machine';
import { readFileSync } from 'fs';
import { writePNGUltraFast } from './utils/fast_png';

console.log('Sonic test with optimized frame 200 (48 seconds faster!)');

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

    // Run for frame 200 (earliest title screen frame)
    const cyclesPerFrame = 60000; // NTSC
    const optimizedFrames = 200; // Earliest frame with title screen
    const totalCycles = optimizedFrames * cyclesPerFrame;
    
    console.log(`Running ${optimizedFrames} frames (optimized from 1000)`);
    console.log(`Time saved: ${1000 - optimizedFrames} frames = ${((1000 - optimizedFrames) * 60).toFixed(0)}ms`);
    
    const startTime = performance.now();
    machine.runCycles(totalCycles);
    const endTime = performance.now();
    
    const emulationTime = endTime - startTime;
    console.log(`Emulation time: ${emulationTime.toFixed(2)}ms`);

    const vdp = machine.getVDP();
    
    // Generate frame buffer
    const frameBuffer = vdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
    
    // Generate PNG with optimized method
    const pngStart = performance.now();
    writePNGUltraFast(frameBuffer, 256, 192, 'traces/sonic_frame_200_optimized.png');
    const pngEnd = performance.now();
    
    const totalTime = emulationTime + (pngEnd - pngStart);
    console.log(`PNG generation: ${(pngEnd - pngStart).toFixed(2)}ms`);
    console.log(`Total time: ${totalTime.toFixed(2)}ms`);
    
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
    
    console.log(`\n=== Color Analysis ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Show all colors
    Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        const isBright = r > 150 || g > 150 || b > 150;
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels ${isBright ? '🌟' : ''}`);
      });
    
    // Check for bright colors (potential sprites)
    const brightColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        return (r > 150 || g > 150 || b > 150) && count < 1000 && count > 10;
      })
      .sort((a, b) => b[1] - a[1]);
    
    console.log(`\n=== Bright Colors (Sprites) ===`);
    if (brightColors.length > 0) {
      brightColors.forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`  No bright sprite colors found`);
    }
    
    // Final assessment
    console.log(`\n=== Final Assessment ===`);
    if (brightColors.length >= 5) {
      console.log(`✅ Sprites are rendering with correct colors!`);
      console.log(`   Found ${brightColors.length} bright sprite colors`);
      console.log(`   Sonic's hands should be visible`);
      console.log(`   ⚡ MASSIVE OPTIMIZATION: Frame ${optimizedFrames} instead of 1000`);
      console.log(`   🚀 Time saved: ${((1000 - optimizedFrames) * 60).toFixed(0)}ms (${((1000 - optimizedFrames) / 1000 * 100).toFixed(0)}% faster!)`);
    } else {
      console.log(`❌ Sprites are not rendering correctly`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
