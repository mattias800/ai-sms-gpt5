import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging ALL Sonic sprites to find hands');

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
    const vdpState = vdp.getState();
    
    // Get VRAM data
    const vram = vdp.getVRAM?.();
    if (!vram) {
      console.log(`❌ VRAM not accessible`);
      return;
    }
    
    // Calculate sprite table addresses
    const spritePatternTableAddr = (vdpState.regs[6] & 0x07) << 11;
    const spriteAttributeTableAddr = (vdpState.regs[8] & 0x7F) << 7;
    
    console.log(`\n=== ALL Sonic Sprites Analysis ===`);
    console.log(`Sprite Attribute Table: 0x${spriteAttributeTableAddr.toString(16)}`);
    console.log(`Sprite Pattern Table: 0x${spritePatternTableAddr.toString(16)}`);
    
    // Set sprite palette colors for testing
    const cram = vdp.getCRAM?.();
    if (!cram) {
      console.log(`❌ CRAM not accessible`);
      return;
    }
    
    // Set bright sprite colors to make sprites visible
    const testColors = [
      0x0000, // Color 16: Transparent
      0x0F00, // Color 17: Red
      0x003F, // Color 18: Blue
      0x0FF0, // Color 19: Yellow
      0x00F0, // Color 20: Green
      0x0F0F, // Color 21: Magenta
      0x00FF, // Color 22: Cyan
      0x0FFF, // Color 23: White
    ];
    
    for (let i = 0; i < testColors.length; i++) {
      const color = testColors[i];
      const cramIdx = (16 + i) * 2;
      if (cramIdx + 1 < cram.length) {
        cram[cramIdx] = color & 0xFF;
        cram[cramIdx + 1] = (color >> 8) & 0xFF;
      }
    }
    
    // Analyze ALL sprites
    let activeSprites = 0;
    let visibleSprites = 0;
    let spritesWithData = 0;
    
    console.log(`\n=== Sprite Details ===`);
    for (let i = 0; i < 64; i++) {
      const addr = spriteAttributeTableAddr + i * 4;
      if (addr + 3 >= vram.length) break;
      
      const y = vram[addr];
      const x = vram[addr + 1];
      const pattern = vram[addr + 2];
      const flags = vram[addr + 3];
      
      // Check if sprite is active (y != 0xD0)
      if (y !== 0xD0) {
        activeSprites++;
        const visible = y >= 0 && y < 192 && x >= 0 && x < 256;
        if (visible) visibleSprites++;
        
        const priority = flags & 0x80 ? 'High' : 'Low';
        const palette = flags & 0x08 ? 'Palette 1' : 'Palette 0';
        const flipX = flags & 0x02 ? 'Yes' : 'No';
        const flipY = flags & 0x04 ? 'Yes' : 'No';
        
        // Check if sprite has pattern data
        const patternAddr = spritePatternTableAddr + pattern * 32;
        let hasData = false;
        let colorIndices = new Set<number>();
        
        for (let j = 0; j < 32; j++) {
          const byte = vram[patternAddr + j];
          if (byte !== 0) {
            hasData = true;
            // Extract color indices from byte (2 bits each)
            for (let pixel = 0; pixel < 4; pixel++) {
              const colorIdx = (byte >> (pixel * 2)) & 0x03;
              colorIndices.add(colorIdx);
            }
          }
        }
        
        if (hasData) spritesWithData++;
        
        // Log all active sprites
        console.log(`  Sprite ${i}: y=${y}, x=${x}, pattern=${pattern}, flags=0x${flags.toString(16)}`);
        console.log(`    Visible: ${visible ? '✅' : '❌'}, Priority: ${priority}, Palette: ${palette}`);
        console.log(`    FlipX: ${flipX}, FlipY: ${flipY}`);
        console.log(`    Has data: ${hasData ? '✅' : '❌'}, Colors: ${Array.from(colorIndices).join(', ')}`);
        
        // Check if this could be Sonic's hands based on position
        if (visible && hasData) {
          if ((x >= 80 && x <= 200) && (y >= 60 && y <= 140)) {
            console.log(`    🎯 POTENTIAL SONIC HAND: In title screen area`);
          }
        }
      }
    }
    
    console.log(`\n=== Sprite Summary ===`);
    console.log(`Active sprites: ${activeSprites}`);
    console.log(`Visible sprites: ${visibleSprites}`);
    console.log(`Sprites with data: ${spritesWithData}`);
    
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

    writeFileSync('traces/sonic_all_sprites_debug.png', PNG.sync.write(png));
    console.log(`📸 Screenshot with all sprites: traces/sonic_all_sprites_debug.png`);
    
    // Analyze screenshot for sprite colors
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
    
    // Look for bright sprite colors
    const brightColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        // Look for bright colors that might be sprites
        return (r > 200 || g > 200 || b > 200) && count < 1000 && count > 10;
      })
      .sort((a, b) => b[1] - a[1]);
    
    if (brightColors.length > 0) {
      console.log(`\nBright colors (potential sprites):`);
      brightColors.forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`\nNo bright sprite colors detected`);
    }
    
    // Check specific areas where Sonic's hands might be
    console.log(`\n=== Sonic Hands Search ===`);
    const handAreas = [
      { name: 'Center', x: 120, y: 100, size: 20 },
      { name: 'Left', x: 80, y: 100, size: 20 },
      { name: 'Right', x: 160, y: 100, size: 20 },
      { name: 'Top', x: 120, y: 80, size: 20 },
      { name: 'Bottom', x: 120, y: 120, size: 20 },
    ];
    
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
        console.log(`  ${area.name} area: RGB(${r},${g},${b}) - ${count}/${totalPixels} pixels (${percentage}%) ${isBright ? '🌟' : ''}`);
      }
    });
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
