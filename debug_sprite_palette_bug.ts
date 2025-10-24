import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging sprite palette bug');

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
    
    console.log(`\n=== Sprite Palette Debug ===`);
    
    // Get VRAM data
    const vram = vdp.getVRAM?.();
    if (!vram) {
      console.log(`❌ VRAM not accessible`);
      return;
    }
    
    // Calculate sprite table addresses
    const spritePatternTableAddr = (vdpState.regs[6] & 0x07) << 11;
    const spriteAttributeTableAddr = (vdpState.regs[8] & 0x7F) << 7;
    
    console.log(`Sprite Attribute Table: 0x${spriteAttributeTableAddr.toString(16)}`);
    console.log(`Sprite Pattern Table: 0x${spritePatternTableAddr.toString(16)}`);
    
    // Check sprite flags for potential hand sprites
    console.log(`\n=== Sprite Flags Analysis ===`);
    for (let i = 9; i <= 10; i++) { // Focus on potential hand sprites
      const addr = spriteAttributeTableAddr + i * 4;
      if (addr + 3 >= vram.length) break;
      
      const y = vram[addr];
      const x = vram[addr + 1];
      const pattern = vram[addr + 2];
      
      // Read sprite flags from extended SAT
      const satXAddr = (spriteAttributeTableAddr + 128 + i * 2) & 0x3fff;
      const spriteFlags = vram[(satXAddr + 2) & 0x3fff] ?? 0;
      
      console.log(`Sprite ${i}: y=${y}, x=${x}, pattern=${pattern}`);
      console.log(`  Flags: 0x${spriteFlags.toString(16)}`);
      console.log(`  Bit 3 (palette): ${(spriteFlags & 0x08) ? 'Sprite palette (16-31)' : 'Background palette (0-15)'}`);
      console.log(`  Bit 0 (flip X): ${(spriteFlags & 0x01) ? 'Yes' : 'No'}`);
      console.log(`  Bit 1 (flip Y): ${(spriteFlags & 0x02) ? 'Yes' : 'No'}`);
      console.log(`  Bit 7 (priority): ${(spriteFlags & 0x80) ? 'High' : 'Low'}`);
      
      // Check sprite pattern colors
      const patternAddr = spritePatternTableAddr + pattern * 32;
      let colorIndices = new Set<number>();
      
      for (let j = 0; j < 32; j++) {
        const byte = vram[patternAddr + j];
        if (byte !== 0) {
          // Extract color indices from byte (2 bits each)
          for (let pixel = 0; pixel < 4; pixel++) {
            const colorIdx = (byte >> (pixel * 2)) & 0x03;
            colorIndices.add(colorIdx);
          }
        }
      }
      
      console.log(`  Pattern colors: ${Array.from(colorIndices).join(', ')}`);
      
      // Show what palette colors these would map to
      const useSpritePalette = (spriteFlags & 0x08) !== 0;
      console.log(`  Final palette colors: ${Array.from(colorIndices).map(c => useSpritePalette ? (16 + c) : c).join(', ')}`);
    }
    
    // Check CRAM contents
    console.log(`\n=== CRAM Analysis ===`);
    const cram = vdp.getCRAM?.();
    if (!cram) {
      console.log(`❌ CRAM not accessible`);
      return;
    }
    
    console.log(`CRAM size: ${cram.length} bytes`);
    
    // Check background palette (colors 0-15)
    console.log(`\nBackground palette (colors 0-15):`);
    for (let i = 0; i < 16; i++) {
      const cramIdx = i * 2;
      if (cramIdx + 1 < cram.length) {
        const low = cram[cramIdx] ?? 0;
        const high = cram[cramIdx + 1] ?? 0;
        const color = (high << 8) | low;
        
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        
        console.log(`  Color ${i}: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
      }
    }
    
    // Check sprite palette (colors 16-31)
    console.log(`\nSprite palette (colors 16-31):`);
    for (let i = 16; i < 32; i++) {
      const cramIdx = i * 2;
      if (cramIdx + 1 < cram.length) {
        const low = cram[cramIdx] ?? 0;
        const high = cram[cramIdx + 1] ?? 0;
        const color = (high << 8) | low;
        
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        
        console.log(`  Color ${i}: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
      }
    }
    
    // Generate screenshot to see current state
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
    console.log(`📸 Debug screenshot: traces/sonic_sprite_palette_debug.png`);
    
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
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
