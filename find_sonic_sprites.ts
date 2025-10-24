import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Finding where Sonic sprites are actually positioned');

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
    
    // Find all bright pixels and their positions
    const brightPixels: Array<{x: number, y: number, color: string}> = [];
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        
        // Look for bright colors (potential sprites)
        if (r > 150 || g > 150 || b > 150) {
          brightPixels.push({x, y, color: `${r},${g},${b}`});
        }
      }
    }
    
    console.log(`\n=== Bright Pixels Analysis ===`);
    console.log(`Total bright pixels: ${brightPixels.length}`);
    
    // Group by color
    const pixelsByColor = new Map<string, Array<{x: number, y: number}>>();
    brightPixels.forEach(pixel => {
      if (!pixelsByColor.has(pixel.color)) {
        pixelsByColor.set(pixel.color, []);
      }
      pixelsByColor.get(pixel.color)!.push({x: pixel.x, y: pixel.y});
    });
    
    console.log(`\n=== Sprite Color Groups ===`);
    pixelsByColor.forEach((pixels, color) => {
      console.log(`\nColor RGB(${color}): ${pixels.length} pixels`);
      
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
      
      // Show sample positions
      console.log(`  Sample positions: ${pixels.slice(0, 5).map(p => `(${p.x},${p.y})`).join(', ')}`);
      
      // Check if this forms recognizable shapes
      if (pixels.length > 50) {
        console.log(`  📐 Large sprite area - could be Sonic's body or hands`);
      } else if (pixels.length > 10) {
        console.log(`  🔸 Medium sprite area - could be Sonic's hands`);
      } else {
        console.log(`  🔹 Small sprite area - could be details or effects`);
      }
    });
    
    // Check specific areas for Sonic's hands
    console.log(`\n=== Sonic Hands Search ===`);
    const handAreas = [
      { name: 'Center', x: 120, y: 100, size: 40 },
      { name: 'Left', x: 80, y: 100, size: 40 },
      { name: 'Right', x: 160, y: 100, size: 40 },
      { name: 'Top', x: 120, y: 80, size: 40 },
      { name: 'Bottom', x: 120, y: 120, size: 40 },
      { name: 'Top-Left', x: 80, y: 80, size: 40 },
      { name: 'Top-Right', x: 160, y: 80, size: 40 },
      { name: 'Bottom-Left', x: 80, y: 120, size: 40 },
      { name: 'Bottom-Right', x: 160, y: 120, size: 40 },
    ];
    
    handAreas.forEach(area => {
      const colors = new Map<string, number>();
      let brightPixelCount = 0;
      
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
          
          if (r > 150 || g > 150 || b > 150) {
            brightPixelCount++;
          }
        }
      }
      
      const totalPixels = (area.size * 2 + 1) ** 2;
      const brightPercentage = (brightPixelCount / totalPixels * 100).toFixed(1);
      
      console.log(`  ${area.name} area: ${brightPixelCount}/${totalPixels} bright pixels (${brightPercentage}%)`);
      
      if (brightPixelCount > 50) {
        console.log(`    🌟 High sprite activity in ${area.name} area!`);
      } else if (brightPixelCount > 10) {
        console.log(`    ✨ Some sprite activity in ${area.name} area`);
      }
    });
    
    // Generate a debug screenshot highlighting bright pixels
    const debugPng = new PNG({ width, height });
    
    for (let i = 0; i < width * height; i++) {
      const srcIdx = i * 3;
      const dstIdx = i * 4;
      
      const r = frameBuffer[srcIdx] ?? 0;
      const g = frameBuffer[srcIdx + 1] ?? 0;
      const b = frameBuffer[srcIdx + 2] ?? 0;
      
      // Highlight bright pixels in red
      if (r > 150 || g > 150 || b > 150) {
        debugPng.data[dstIdx] = 255;     // Red
        debugPng.data[dstIdx + 1] = 0;   // Green
        debugPng.data[dstIdx + 2] = 0;   // Blue
      } else {
        debugPng.data[dstIdx] = r;
        debugPng.data[dstIdx + 1] = g;
        debugPng.data[dstIdx + 2] = b;
      }
      debugPng.data[dstIdx + 3] = 255;
    }
    
    writeFileSync('traces/sonic_sprites_highlighted.png', PNG.sync.write(debugPng));
    console.log(`📸 Debug screenshot with bright pixels highlighted in red: traces/sonic_sprites_highlighted.png`);
    
    // Final assessment
    console.log(`\n=== Final Assessment ===`);
    if (brightPixels.length > 1000) {
      console.log(`✅ Many sprites are rendering (${brightPixels.length} bright pixels)`);
      console.log(`   Sonic's hands are likely visible but may be positioned outside the center area`);
    } else if (brightPixels.length > 100) {
      console.log(`⚠️  Some sprites are rendering (${brightPixels.length} bright pixels)`);
      console.log(`   Sonic's hands might be partially visible`);
    } else {
      console.log(`❌ Few sprites are rendering (${brightPixels.length} bright pixels)`);
      console.log(`   Sonic's hands are likely not visible`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
