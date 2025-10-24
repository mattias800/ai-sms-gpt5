import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging sprite rendering logic for Sonic');

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
    
    console.log(`\n=== Sonic Sprite Rendering Debug ===`);
    console.log(`R1 (Display Control): 0x${vdpState.regs[1].toString(16)}`);
    console.log(`  - Display enable: ${vdpState.regs[1] & 0x40 ? 'ON' : 'OFF'}`);
    console.log(`  - Sprite enable: ${vdpState.regs[1] & 0x02 ? 'ON' : 'OFF'}`);
    console.log(`  - Sprite size: ${vdpState.regs[1] & 0x01 ? '8x16' : '8x8'}`);
    
    // Check sprite registers
    console.log(`R6 (Sprite Pattern Table): 0x${vdpState.regs[6].toString(16)}`);
    console.log(`R8 (Sprite Attribute Table): 0x${vdpState.regs[8].toString(16)}`);
    
    // Calculate sprite table addresses
    const spritePatternTableAddr = (vdpState.regs[6] & 0x07) << 11;
    const spriteAttributeTableAddr = (vdpState.regs[8] & 0x7F) << 7;
    
    console.log(`Sprite Pattern Table: 0x${spritePatternTableAddr.toString(16)}`);
    console.log(`Sprite Attribute Table: 0x${spriteAttributeTableAddr.toString(16)}`);
    
    // Get VRAM data
    const vram = vdp.getVRAM?.();
    if (!vram) {
      console.log(`❌ VRAM not accessible`);
      return;
    }
    
    // Manually set some sprite palette colors to test rendering
    console.log(`\n=== Manual Sprite Palette Test ===`);
    const cram = vdp.getCRAM?.();
    if (!cram) {
      console.log(`❌ CRAM not accessible`);
      return;
    }
    
    // Set sprite colors manually to test if sprites render
    const testColors = [
      0x0000, // Color 16: Transparent
      0x0F00, // Color 17: Red
      0x003F, // Color 18: Blue
      0x0FF0, // Color 19: Yellow
      0x00F0, // Color 20: Green
    ];
    
    for (let i = 0; i < testColors.length; i++) {
      const color = testColors[i];
      const cramIdx = (16 + i) * 2;
      if (cramIdx + 1 < cram.length) {
        cram[cramIdx] = color & 0xFF;     // Low byte
        cram[cramIdx + 1] = (color >> 8) & 0xFF; // High byte
        
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        console.log(`  Set sprite color ${16 + i}: RGB(${r},${g},${b})`);
      }
    }
    
    // Check sprite attribute table for potential Sonic hands
    console.log(`\n=== Sprite Attribute Analysis ===`);
    let potentialHandSprites = 0;
    
    for (let i = 0; i < 64; i++) {
      const addr = spriteAttributeTableAddr + i * 4;
      if (addr + 3 >= vram.length) break;
      
      const y = vram[addr];
      const x = vram[addr + 1];
      const pattern = vram[addr + 2];
      const flags = vram[addr + 3];
      
      // Check if sprite is active (y != 0xD0)
      if (y !== 0xD0) {
        const visible = y >= 0 && y < 192 && x >= 0 && x < 256;
        
        // Look for sprites in the center area where Sonic's hands might be
        if (visible && (x >= 100 && x <= 200) && (y >= 80 && y <= 120)) {
          potentialHandSprites++;
          const priority = flags & 0x80 ? 'High' : 'Low';
          const palette = flags & 0x08 ? 'Palette 1' : 'Palette 0';
          
          console.log(`  Potential hand sprite ${i}: y=${y}, x=${x}, pattern=${pattern}, flags=0x${flags.toString(16)}`);
          console.log(`    Priority: ${priority}, Palette: ${palette}`);
          
          // Check if this sprite has non-zero pattern data
          const patternAddr = spritePatternTableAddr + pattern * 32;
          let hasData = false;
          for (let j = 0; j < 32; j++) {
            if (vram[patternAddr + j] !== 0) {
              hasData = true;
              break;
            }
          }
          console.log(`    Pattern data: ${hasData ? 'Yes' : 'No'}`);
        }
      }
    }
    
    console.log(`\nFound ${potentialHandSprites} potential hand sprites`);
    
    // Generate screenshot with manual sprite colors
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

    writeFileSync('traces/sonic_sprite_rendering_debug.png', PNG.sync.write(png));
    console.log(`📸 Screenshot with manual sprite colors: traces/sonic_sprite_rendering_debug.png`);
    
    // Analyze the screenshot for new colors
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
    
    // Look for the test sprite colors we set
    const testSpriteColors = [
      '255,0,0',   // Red
      '0,0,255',   // Blue
      '255,255,0', // Yellow
      '0,255,0',   // Green
    ];
    
    console.log(`\nTest sprite colors in screenshot:`);
    testSpriteColors.forEach(colorKey => {
      const count = colorMap.get(colorKey) ?? 0;
      if (count > 0) {
        console.log(`  RGB(${colorKey}): ${count} pixels ✅`);
      } else {
        console.log(`  RGB(${colorKey}): 0 pixels ❌`);
      }
    });
    
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
      
      // Check if any test sprite colors appear in hands area
      const hasTestColors = testSpriteColors.some(colorKey => 
        handColors.get(colorKey) && (handColors.get(colorKey) ?? 0) > 10
      );
      
      if (hasTestColors) {
        console.log(`✅ Test sprite colors found in hands area - sprites are rendering!`);
      } else {
        console.log(`❌ No test sprite colors in hands area - sprites not rendering`);
      }
    }
    
    // Summary
    console.log(`\n=== Summary ===`);
    if (potentialHandSprites > 0) {
      console.log(`✅ Found ${potentialHandSprites} potential hand sprites`);
      console.log(`   Issue might be:`);
      console.log(`   - Sprite rendering logic bug`);
      console.log(`   - Sprite priority/visibility issues`);
      console.log(`   - Sprite pattern data corruption`);
    } else {
      console.log(`❌ No potential hand sprites found`);
      console.log(`   Sonic might not have hand sprites on title screen`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
