import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging sprite palette for Sonic');

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
    
    console.log(`\n=== Sonic Sprite Palette Analysis ===`);
    
    // Get CRAM (Color RAM)
    const cram = vdp.getCRAM?.();
    if (!cram) {
      console.log(`❌ CRAM not accessible`);
      return;
    }
    
    console.log(`CRAM size: ${cram.length} bytes`);
    
    // Analyze sprite palette (colors 16-31)
    console.log(`\n=== Sprite Palette (Colors 16-31) ===`);
    for (let i = 16; i < 32; i++) {
      const cramIdx = i * 2;
      if (cramIdx + 1 < cram.length) {
        const low = cram[cramIdx] ?? 0;
        const high = cram[cramIdx + 1] ?? 0;
        const color = (high << 8) | low;
        
        // Convert SMS color to RGB
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        
        console.log(`  Color ${i}: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
      }
    }
    
    // Analyze background palette (colors 0-15)
    console.log(`\n=== Background Palette (Colors 0-15) ===`);
    for (let i = 0; i < 16; i++) {
      const cramIdx = i * 2;
      if (cramIdx + 1 < cram.length) {
        const low = cram[cramIdx] ?? 0;
        const high = cram[cramIdx + 1] ?? 0;
        const color = (high << 8) | low;
        
        // Convert SMS color to RGB
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        
        console.log(`  Color ${i}: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
      }
    }
    
    // Check if sprite colors are set
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
    
    console.log(`\n=== Sprite Palette Summary ===`);
    console.log(`Sprite colors set (non-zero): ${spriteColorsSet}/16`);
    
    if (spriteColorsSet === 0) {
      console.log(`❌ MAIN ISSUE: No sprite colors are set in CRAM!`);
      console.log(`   Sprites use colors 16-31, but all are 0x0000 (transparent)`);
      console.log(`   This explains why Sonic's hands are invisible!`);
    } else {
      console.log(`✅ Sprite colors are set`);
    }
    
    // Check sprite pattern data for non-zero colors
    console.log(`\n=== Sprite Pattern Analysis ===`);
    const vram = vdp.getVRAM?.();
    if (!vram) {
      console.log(`❌ VRAM not accessible`);
      return;
    }
    
    const spritePatternBase = (vdpState.regs[6] & 0x04) ? 0x2000 : 0x0000;
    console.log(`Sprite pattern base: 0x${spritePatternBase.toString(16)}`);
    
    // Check first few sprite patterns for color data
    for (let pattern = 0; pattern < 8; pattern++) {
      const patternAddr = spritePatternBase + pattern * 32;
      let hasNonZeroColors = false;
      let colorCounts = new Map<number, number>();
      
      for (let i = 0; i < 32; i++) {
        const byte = vram[patternAddr + i] ?? 0;
        if (byte !== 0) {
          hasNonZeroColors = true;
          // Each byte contains 4 pixels (2 bits each)
          for (let pixel = 0; pixel < 4; pixel++) {
            const color = (byte >> (pixel * 2)) & 0x03;
            colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
          }
        }
      }
      
      if (hasNonZeroColors) {
        console.log(`  Pattern ${pattern}: Has data, colors used: ${Array.from(colorCounts.keys()).join(', ')}`);
      }
    }
    
    // Generate a test screenshot to see what's actually rendered
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

    writeFileSync('traces/sonic_sprite_palette_debug.png', PNG.sync.write(png));
    console.log(`📸 Sprite palette debug screenshot: traces/sonic_sprite_palette_debug.png`);
    
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
    
    console.log(`\n=== Screenshot Color Analysis ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Check if any sprite colors (16-31) are present
    const spriteColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        // Look for colors that might be from sprite palette
        return count < 1000 && count > 10; // Small but significant areas
      })
      .sort((a, b) => b[1] - a[1]);
    
    if (spriteColors.length > 0) {
      console.log(`\nPotential sprite colors in screenshot:`);
      spriteColors.slice(0, 5).forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`\nNo obvious sprite colors in screenshot`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
