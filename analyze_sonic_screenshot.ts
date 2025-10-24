import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Comprehensive analysis of Sonic screenshot');

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
    
    // Analyze the entire screenshot pixel by pixel
    console.log(`\n=== Comprehensive Screenshot Analysis ===`);
    
    const colorMap = new Map<string, number>();
    const brightPixels: Array<{x: number, y: number, color: string}> = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
        
        // Collect bright pixels (potential sprites)
        if (r > 150 || g > 150 || b > 150) {
          brightPixels.push({x, y, color: colorKey});
        }
      }
    }
    
    console.log(`Total unique colors: ${colorMap.size}`);
    console.log(`Bright pixels found: ${brightPixels.length}`);
    
    // Show all colors
    console.log(`\n=== All Colors ===`);
    Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        const isBright = r > 150 || g > 150 || b > 150;
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels ${isBright ? '🌟' : ''}`);
      });
    
    // Analyze bright pixels distribution
    if (brightPixels.length > 0) {
      console.log(`\n=== Bright Pixels Distribution ===`);
      
      // Group bright pixels by color
      const brightByColor = new Map<string, Array<{x: number, y: number}>>();
      brightPixels.forEach(pixel => {
        if (!brightByColor.has(pixel.color)) {
          brightByColor.set(pixel.color, []);
        }
        brightByColor.get(pixel.color)!.push({x: pixel.x, y: pixel.y});
      });
      
      brightByColor.forEach((pixels, color) => {
        console.log(`\nColor ${color}: ${pixels.length} pixels`);
        
        // Find bounding box
        const xs = pixels.map(p => p.x);
        const ys = pixels.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        
        console.log(`  Bounding box: (${minX},${minY}) to (${maxX},${maxY})`);
        console.log(`  Size: ${maxX - minX + 1} x ${maxY - minY + 1}`);
        
        // Check if this could be Sonic's hands
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const inTitleArea = centerX >= 80 && centerX <= 200 && centerY >= 60 && centerY <= 140;
        
        if (inTitleArea) {
          console.log(`  🎯 POTENTIAL SONIC HANDS: In title screen area!`);
        }
        
        // Show first few pixel positions
        console.log(`  Sample positions: ${pixels.slice(0, 5).map(p => `(${p.x},${p.y})`).join(', ')}`);
      });
    }
    
    // Check specific sprite colors we set
    console.log(`\n=== Test Sprite Colors ===`);
    const testColors = [
      '255,0,0',   // Red
      '0,0,255',   // Blue
      '255,255,0', // Yellow
      '0,255,0',   // Green
      '255,0,255', // Magenta
      '0,255,255', // Cyan
      '255,255,255', // White
    ];
    
    testColors.forEach(colorKey => {
      const count = colorMap.get(colorKey) ?? 0;
      if (count > 0) {
        console.log(`  RGB(${colorKey}): ${count} pixels ✅`);
      } else {
        console.log(`  RGB(${colorKey}): 0 pixels ❌`);
      }
    });
    
    // Check if any sprites are visible by looking for non-background colors
    const backgroundColors = new Set<string>();
    const dominantColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([color]) => color);
    
    dominantColors.forEach(color => backgroundColors.add(color));
    
    const spriteColors = Array.from(colorMap.entries())
      .filter(([color, count]) => !backgroundColors.has(color) && count > 10)
      .sort((a, b) => b[1] - a[1]);
    
    console.log(`\n=== Potential Sprite Colors ===`);
    if (spriteColors.length > 0) {
      spriteColors.forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`  No potential sprite colors found`);
    }
    
    // Final assessment
    console.log(`\n=== Final Assessment ===`);
    if (brightPixels.length > 100) {
      console.log(`✅ Sprites are rendering (${brightPixels.length} bright pixels)`);
      console.log(`   Sonic's hands might be visible but in unexpected positions`);
    } else if (brightPixels.length > 10) {
      console.log(`⚠️  Some sprites are rendering (${brightPixels.length} bright pixels)`);
      console.log(`   Sonic's hands might be partially visible`);
    } else {
      console.log(`❌ Very few sprites are rendering (${brightPixels.length} bright pixels)`);
      console.log(`   Sonic's hands are likely not visible`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
