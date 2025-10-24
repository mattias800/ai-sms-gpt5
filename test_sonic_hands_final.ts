import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Final test: Are Sonic hands now visible?');

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

    writeFileSync('traces/sonic_hands_final_test.png', PNG.sync.write(png));
    console.log(`📸 Final Sonic screenshot: traces/sonic_hands_final_test.png`);
    
    // Analyze the screenshot for Sonic hands
    console.log(`\n=== Sonic Hands Analysis ===`);
    
    // Check multiple areas where hands might be
    const handAreas = [
      { name: 'Center', x: 120, y: 100, size: 30 },
      { name: 'Left', x: 80, y: 100, size: 30 },
      { name: 'Right', x: 160, y: 100, size: 30 },
      { name: 'Top', x: 120, y: 80, size: 30 },
      { name: 'Bottom', x: 120, y: 120, size: 30 },
    ];
    
    let foundHands = false;
    
    handAreas.forEach(area => {
      const colors = new Map<string, number>();
      for (let dy = -area.size; dy <= area.size; dy++) {
        for (let dx = -area.size; dx <= area.size; dx++) {
          const x = area.x + dx;
          const y = area.y + dy;
          
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          
          const idx = (y * width + x) * 3;
          const r = frameBuffer[idx] ?? 0;
          const g = frameBuffer[idx + 1] ?? 0;
          const b = frameBuffer[idx + 2] ?? 0;
          const colorKey = `${r},${g},${b}`;
          colors.set(colorKey, (colors.get(colorKey) ?? 0) + 1);
        }
      }
      
      const dominantColor = Array.from(colors.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      if (dominantColor) {
        const [colorKey, count] = dominantColor;
        const [r, g, b] = colorKey.split(',').map(Number);
        const totalPixels = (area.size * 2 + 1) ** 2;
        const percentage = (count / totalPixels * 100).toFixed(1);
        
        const isBright = r > 150 || g > 150 || b > 150;
        const isNotBlack = r > 50 || g > 50 || b > 50;
        
        console.log(`  ${area.name} area: RGB(${r},${g},${b}) - ${count}/${totalPixels} pixels (${percentage}%) ${isBright ? '🌟' : ''} ${isNotBlack ? '✅' : '❌'}`);
        
        if (isBright && isNotBlack) {
          foundHands = true;
        }
      }
    });
    
    // Overall color analysis
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
    
    console.log(`\n=== Overall Analysis ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Look for bright colors that might be sprites
    const brightColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        return (r > 150 || g > 150 || b > 150) && count < 1000 && count > 10;
      })
      .sort((a, b) => b[1] - a[1]);
    
    if (brightColors.length > 0) {
      console.log(`\nBright colors (potential sprites):`);
      brightColors.forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    }
    
    // Final verdict
    console.log(`\n=== FINAL VERDICT ===`);
    if (foundHands) {
      console.log(`🎉 SUCCESS: Sonic's hands are now visible!`);
      console.log(`   The sprite palette fix worked!`);
    } else {
      console.log(`❌ Sonic's hands are still not visible`);
      console.log(`   Possible issues:`);
      console.log(`   - Hands are positioned outside tested areas`);
      console.log(`   - Hands use colors that blend with background`);
      console.log(`   - Hands are not implemented as sprites`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
