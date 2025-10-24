import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging palette break - everything is red');

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

    // Run for 1000 frames
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

    writeFileSync('traces/sonic_palette_broken.png', PNG.sync.write(png));
    console.log(`📸 Broken palette screenshot: traces/sonic_palette_broken.png`);
    
    // Analyze colors
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
    
    console.log(`\n=== Color Analysis ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Show all colors
    Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([colorKey, count], i) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
      });
    
    // Check CRAM
    const cram = vdp.getCRAM?.();
    if (cram) {
      console.log(`\n=== CRAM Analysis ===`);
      console.log(`CRAM size: ${cram.length} bytes`);
      
      // Show first few CRAM entries
      for (let i = 0; i < Math.min(16, cram.length / 2); i++) {
        const low = cram[i * 2] ?? 0;
        const high = cram[i * 2 + 1] ?? 0;
        const color = (high << 8) | low;
        
        const r = (color & 0x03) << 6;
        const g = ((color >> 2) & 0x03) << 6;
        const b = ((color >> 4) & 0x03) << 6;
        
        console.log(`  CRAM[${i}]: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
