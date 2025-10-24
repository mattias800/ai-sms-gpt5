import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing manual sprite palette fix for Sonic');

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
    
    console.log(`\n=== Before Fix ===`);
    const cram = vdp.getCRAM?.();
    if (!cram) {
      console.log(`❌ CRAM not accessible`);
      return;
    }
    
    // Check sprite palette before fix
    let spriteColorsSet = 0;
    for (let i = 16; i < 32; i++) {
      const cramIdx = i * 2;
      if (cramIdx + 1 < cram.length) {
        const low = cram[cramIdx] ?? 0;
        const high = cram[cramIdx + 1] ?? 0;
        const color = (high << 8) | low;
        if (color !== 0) spriteColorsSet++;
      }
    }
    console.log(`Sprite colors set before fix: ${spriteColorsSet}/16`);
    
    // Manually set sprite palette colors
    console.log(`\n=== Manual Sprite Palette Fix ===`);
    
    // Set some sprite colors manually
    const spriteColors = [
      0x0000, // Color 16: Transparent (keep as is)
      0x0F00, // Color 17: Red
      0x003F, // Color 18: Blue  
      0x0FF0, // Color 19: Yellow
      0x00F0, // Color 20: Green
      0x0F0F, // Color 21: Magenta
      0x00FF, // Color 22: Cyan
      0x0FFF, // Color 23: White
      0x0F30, // Color 24: Orange
      0x033F, // Color 25: Light Blue
      0x0F60, // Color 26: Light Yellow
      0x0060, // Color 27: Light Green
      0x0F90, // Color 28: Pink
      0x0390, // Color 29: Light Magenta
      0x0090, // Color 30: Light Cyan
      0x0FC0, // Color 31: Light Orange
    ];
    
    for (let i = 0; i < spriteColors.length; i++) {
      const color = spriteColors[i];
      const cramIdx = (16 + i) * 2;
      if (cramIdx + 1 < cram.length) {
        cram[cramIdx] = color & 0xFF;     // Low byte
        cram[cramIdx + 1] = (color >> 8) & 0xFF; // High byte
        
        // Convert to RGB for logging
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        console.log(`  Set color ${16 + i}: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
      }
    }
    
    console.log(`\n=== After Fix ===`);
    
    // Check sprite palette after fix
    spriteColorsSet = 0;
    for (let i = 16; i < 32; i++) {
      const cramIdx = i * 2;
      if (cramIdx + 1 < cram.length) {
        const low = cram[cramIdx] ?? 0;
        const high = cram[cramIdx + 1] ?? 0;
        const color = (high << 8) | low;
        if (color !== 0) spriteColorsSet++;
      }
    }
    console.log(`Sprite colors set after fix: ${spriteColorsSet}/16`);
    
    // Generate screenshot with fixed sprite palette
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

    writeFileSync('traces/sonic_manual_sprite_palette_fix.png', PNG.sync.write(png));
    console.log(`📸 Screenshot with manual sprite palette fix: traces/sonic_manual_sprite_palette_fix.png`);
    
    // Analyze the screenshot for sprite colors
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
    
    console.log(`\n=== Screenshot Analysis After Fix ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Look for new colors that might be sprites
    const newColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        // Look for bright colors that are not dominant
        return (r > 150 || g > 150 || b > 150) && count < 1000 && count > 10;
      })
      .sort((a, b) => b[1] - a[1]);
    
    if (newColors.length > 0) {
      console.log(`\nNew potential sprite colors:`);
      newColors.slice(0, 5).forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`\nNo new sprite colors detected`);
    }
    
    // Check Sonic hands area specifically
    console.log(`\n=== Sonic Hands Area Analysis ===`);
    const handAreaX = 120;
    const handAreaY = 100;
    const handAreaSize = 20;
    
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
      console.log(`Dominant color in hands area: RGB(${r},${g},${b}) - ${count}/${totalPixels} pixels (${percentage}%)`);
      
      if (r > 100 || g > 100 || b > 100) {
        console.log(`✅ Sonic hands area now has bright colors - sprites might be visible!`);
      } else {
        console.log(`❌ Sonic hands area still dark`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
