import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing sprite flags fix');

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

    // Run for 1000 frames (optimal title screen frame for Sonic)
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

    writeFileSync('traces/sonic_sprite_flags_fixed.png', PNG.sync.write(png));
    console.log(`📸 Screenshot with fixed sprite flags: traces/sonic_sprite_flags_fixed.png`);
    
    // Analyze the screenshot
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
    
    console.log(`\n=== Screenshot Analysis ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Show all colors
    Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        const isBright = r > 150 || g > 150 || b > 150;
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels ${isBright ? '🌟' : ''}`);
      });
    
    // Check for bright colors that might be sprites
    const brightColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        return (r > 150 || g > 150 || b > 150) && count < 1000 && count > 10;
      })
      .sort((a, b) => b[1] - a[1]);
    
    console.log(`\n=== Bright Colors (Potential Sprites) ===`);
    if (brightColors.length > 0) {
      brightColors.forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`  No bright sprite colors found`);
    }
    
    // Check Sonic hands area
    console.log(`\n=== Sonic Hands Area Check ===`);
    const handAreaX = 120;
    const handAreaY = 100;
    const handAreaSize = 30;
    
    const handColors = new Map<string, number>();
    for (let dy = -handAreaSize; dy <= handAreaSize; dy++) {
      for (let dx = -handAreaSize; dx <= handAreaSize; dx++) {
        const x = handAreaX + dx;
        const y = handAreaY + dy;
        
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        
        const idx = (y * width + x) * 3;
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        const colorKey = `${r},${g},${b}`;
        handColors.set(colorKey, (handColors.get(colorKey) ?? 0) + 1);
      }
    }
    
    const dominantHandColor = Array.from(handColors.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (dominantHandColor) {
      const [colorKey, count] = dominantHandColor;
      const [r, g, b] = colorKey.split(',').map(Number);
      const totalPixels = (handAreaSize * 2 + 1) ** 2;
      const percentage = (count / totalPixels * 100).toFixed(1);
      
      const isBright = r > 150 || g > 150 || b > 150;
      const isNotBlack = r > 50 || g > 50 || b > 50;
      
      console.log(`Dominant color in hands area: RGB(${r},${g},${b}) - ${count}/${totalPixels} pixels (${percentage}%)`);
      
      if (isBright && isNotBlack) {
        console.log(`✅ Sonic hands area has bright colors - sprites are visible!`);
      } else {
        console.log(`❌ Sonic hands area is still dark`);
      }
    }
    
    // Final verdict
    console.log(`\n=== Final Verdict ===`);
    if (brightColors.length > 0) {
      console.log(`✅ Sprites are rendering with correct colors!`);
      console.log(`   Found ${brightColors.length} bright sprite colors`);
    } else {
      console.log(`❌ Sprites are still not rendering correctly`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
