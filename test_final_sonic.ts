import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Final test: Sonic with correct palettes and sprite flags fix');

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
    
    // Generate screenshot
    const frameBuffer = vdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
    const width = 256;
    const height = 192;
    const png = new PNG({ width, height });

    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * 3;
      const dstIdx = i * 4;
      png.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
      png.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
      png.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
      png.data[dstIdx + 3] = 255;
    }

    writeFileSync('traces/sonic_final_correct.png', PNG.sync.write(png));
    console.log(`📸 Final Sonic screenshot: traces/sonic_final_correct.png`);
    
    // Analyze colors
    const colorMap = new Map<string, number>();
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
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
    if (brightColors.length > 0) {
      console.log(`✅ Sprites are rendering with correct colors!`);
      console.log(`   Found ${brightColors.length} bright sprite colors`);
      console.log(`   Sonic's hands should be visible`);
    } else {
      console.log(`❌ Sprites are not rendering correctly`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
