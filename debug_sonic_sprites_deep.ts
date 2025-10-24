import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Deep debugging of Sonic sprite rendering');

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
    const cpuState = machine.getCPU().getState();
    
    console.log(`\n=== Sonic Frame 1000 Deep Analysis ===`);
    console.log(`CPU PC: 0x${cpuState.pc.toString(16)}`);
    console.log(`R1 (Display Control): 0x${vdpState.regs[1].toString(16)}`);
    console.log(`  - Display enable: ${vdpState.regs[1] & 0x40 ? 'ON' : 'OFF'}`);
    console.log(`  - Sprite enable: ${vdpState.regs[1] & 0x02 ? 'ON' : 'OFF'}`);
    console.log(`  - Sprite size: ${vdpState.regs[1] & 0x01 ? '8x16' : '8x8'}`);
    
    // Check sprite-related registers
    console.log(`\n=== Sprite Registers ===`);
    console.log(`R6 (Sprite Pattern Table): 0x${vdpState.regs[6].toString(16)}`);
    console.log(`R8 (Sprite Attribute Table): 0x${vdpState.regs[8].toString(16)}`);
    
    // Calculate sprite table addresses
    const spritePatternTableAddr = (vdpState.regs[6] & 0x07) << 11;
    const spriteAttributeTableAddr = (vdpState.regs[8] & 0x7F) << 7;
    
    console.log(`\n=== Sprite Table Addresses ===`);
    console.log(`Sprite Pattern Table: 0x${spritePatternTableAddr.toString(16)}`);
    console.log(`Sprite Attribute Table: 0x${spriteAttributeTableAddr.toString(16)}`);
    
    // Get VRAM data
    const vram = vdp.getVRAM?.();
    if (!vram) {
      console.log(`❌ VRAM not accessible`);
      return;
    }
    
    console.log(`VRAM size: ${vram.length} bytes`);
    
    // Analyze sprite attribute table
    console.log(`\n=== Sprite Attribute Table Analysis ===`);
    console.log(`Reading sprite attributes from 0x${spriteAttributeTableAddr.toString(16)}:`);
    
    let activeSprites = 0;
    let visibleSprites = 0;
    
    // Read sprite attribute table (64 sprites max)
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
        
        console.log(`  Sprite ${i}: y=${y}, x=${x}, pattern=${pattern}, flags=0x${flags.toString(16)}`);
        console.log(`    Visible: ${visible ? '✅' : '❌'}, Priority: ${priority}, Palette: ${palette}`);
        console.log(`    FlipX: ${flipX}, FlipY: ${flipY}`);
        
        // Check if this could be Sonic's hands
        if (visible && (x >= 100 && x <= 200) && (y >= 80 && y <= 120)) {
          console.log(`    🎯 POTENTIAL SONIC HAND: Position suggests title screen area`);
        }
      }
    }
    
    console.log(`\n=== Sprite Summary ===`);
    console.log(`Active sprites: ${activeSprites}`);
    console.log(`Visible sprites: ${visibleSprites}`);
    
    if (activeSprites === 0) {
      console.log(`❌ No active sprites found! This explains missing hands.`);
    } else if (visibleSprites === 0) {
      console.log(`❌ Sprites exist but none are visible (positioned off-screen)`);
    } else {
      console.log(`✅ Found ${visibleSprites} visible sprites`);
    }
    
    // Check sprite pattern table for data
    console.log(`\n=== Sprite Pattern Table Analysis ===`);
    console.log(`Reading sprite patterns from 0x${spritePatternTableAddr.toString(16)}:`);
    
    let patternsWithData = 0;
    
    // Check first 32 sprite patterns for non-zero data
    for (let i = 0; i < 32; i++) {
      const addr = spritePatternTableAddr + i * 32; // 8x8 sprite = 32 bytes
      if (addr + 31 >= vram.length) break;
      
      let hasData = false;
      for (let j = 0; j < 32; j++) {
        if (vram[addr + j] !== 0) {
          hasData = true;
          break;
        }
      }
      
      if (hasData) {
        patternsWithData++;
        console.log(`  Pattern ${i}: Has data at 0x${addr.toString(16)}`);
        
        // Show first few bytes
        const bytes = [];
        for (let j = 0; j < 8; j++) {
          bytes.push(`0x${vram[addr + j].toString(16).padStart(2, '0')}`);
        }
        console.log(`    First 8 bytes: ${bytes.join(', ')}`);
      }
    }
    
    console.log(`\nPatterns with data: ${patternsWithData}`);
    
    if (patternsWithData === 0) {
      console.log(`❌ No sprite pattern data found! This explains missing hands.`);
    } else {
      console.log(`✅ Found ${patternsWithData} sprite patterns with data`);
    }
    
    // Generate screenshot for visual analysis
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

    writeFileSync('traces/sonic_deep_sprite_analysis.png', PNG.sync.write(png));
    console.log(`📸 Deep analysis screenshot: traces/sonic_deep_sprite_analysis.png`);
    
    // Analyze the screenshot for sprite-like features
    console.log(`\n=== Screenshot Analysis ===`);
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
    
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Look for sprite-like colors (small, bright areas)
    const spriteColors = Array.from(colorMap.entries())
      .filter(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        // Look for bright colors that are not dominant (likely sprites)
        return (r > 150 || g > 150 || b > 150) && count < 500 && count > 10;
      })
      .sort((a, b) => b[1] - a[1]);
    
    if (spriteColors.length > 0) {
      console.log(`\nPotential sprite colors:`);
      spriteColors.slice(0, 5).forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    } else {
      console.log(`\nNo obvious sprite colors detected`);
    }
    
    // Check center area for Sonic's hands
    console.log(`\n=== Sonic Hands Area Analysis ===`);
    const handAreaX = 120; // Approximate center
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
    
    console.log(`Colors in Sonic hands area: ${handColors.size}`);
    const dominantHandColor = Array.from(handColors.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (dominantHandColor) {
      const [colorKey, count] = dominantHandColor;
      const [r, g, b] = colorKey.split(',').map(Number);
      const totalPixels = (handAreaSize * 2 + 1) ** 2;
      const percentage = (count / totalPixels * 100).toFixed(1);
      console.log(`Dominant color: RGB(${r},${g},${b}) - ${count}/${totalPixels} pixels (${percentage}%)`);
      
      if (r === 0 && g === 0 && b === 0) {
        console.log(`❌ Sonic hands area is black - no sprite data!`);
      } else {
        console.log(`✅ Sonic hands area has color data`);
      }
    }
    
    // Summary
    console.log(`\n=== Summary ===`);
    if (activeSprites === 0) {
      console.log(`❌ MAIN ISSUE: No active sprites in attribute table`);
      console.log(`   Possible causes:`);
      console.log(`   - Game hasn't loaded sprite data yet`);
      console.log(`   - Sprites are positioned at y=0xD0 (inactive)`);
      console.log(`   - Sprite attribute table is empty`);
    } else if (patternsWithData === 0) {
      console.log(`❌ MAIN ISSUE: No sprite pattern data`);
      console.log(`   Possible causes:`);
      console.log(`   - Game hasn't loaded sprite patterns yet`);
      console.log(`   - Sprite pattern table is empty`);
      console.log(`   - Wrong sprite pattern table address`);
    } else if (visibleSprites === 0) {
      console.log(`❌ MAIN ISSUE: Sprites exist but are positioned off-screen`);
      console.log(`   Possible causes:`);
      console.log(`   - Sprites are positioned outside visible area`);
      console.log(`   - Sprite positioning calculation error`);
    } else {
      console.log(`✅ Sprites are active and visible`);
      console.log(`   Issue might be:`);
      console.log(`   - Wrong sprite patterns`);
      console.log(`   - Palette issues`);
      console.log(`   - Sprite rendering logic`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
