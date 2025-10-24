import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Comparing our Spy vs Spy output with reference standards');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Run to frame 1000 (title screen)
for (let frame = 0; frame < 1000; frame++) {
  machine.runCycles(228 * 262);
}

// Generate our output
try {
  mkdirSync('traces', { recursive: true });
  
  const frameBuffer = vdp.renderFrame();
  if (frameBuffer) {
    const png = new PNG({ width: 256, height: 192 });
    for (let i = 0; i < 256 * 192; i++) {
      const srcIdx = i * 3;
      const dstIdx = i * 4;
      png.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
      png.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
      png.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
      png.data[dstIdx + 3] = 255;
    }
    
    const filename = 'traces/spy_vs_spy_our_output.png';
    png.pack().pipe(createWriteStream(filename));
    console.log(`📸 Saved our output: ${filename}`);
    
    // Analyze our output
    const colorMap = new Map<string, number>();
    const pixelData: Array<{x: number, y: number, r: number, g: number, b: number}> = [];
    
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 3;
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
        
        pixelData.push({ x, y, r, g, b });
      }
    }
    
    console.log(`\nOur output analysis:`);
    console.log(`  Total colors: ${colorMap.size}`);
    console.log(`  Color palette:`);
    
    // Sort colors by frequency
    const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
    sortedColors.forEach(([color, count], i) => {
      const [r, g, b] = color.split(',').map(Number);
      const percentage = (count / (256 * 192) * 100).toFixed(2);
      console.log(`    ${(i+1).toString().padStart(2, ' ')}: RGB(${r},${g},${b}) - ${percentage}%`);
    });
    
    // Check for specific expected colors
    const expectedColors = [
      { name: 'Background Blue', r: 0, g: 85, b: 255 },
      { name: 'Text White', r: 255, g: 255, b: 255 },
      { name: 'Accent Yellow', r: 255, g: 255, b: 0 }
    ];
    
    console.log(`\nExpected color analysis:`);
    expectedColors.forEach(expected => {
      const found = pixelData.find(p => p.r === expected.r && p.g === expected.g && p.b === expected.b);
      if (found) {
        const count = colorMap.get(`${expected.r},${expected.g},${expected.b}`) ?? 0;
        const percentage = (count / (256 * 192) * 100).toFixed(2);
        console.log(`  ✅ ${expected.name}: Found ${count} pixels (${percentage}%)`);
      } else {
        console.log(`  ❌ ${expected.name}: Not found`);
      }
    });
    
  }
} catch (error) {
  console.log('Screenshot generation failed:', (error as Error).message);
}

console.log('\n=== Next Steps for Verification ===');
console.log('1. Compare with MAME reference screenshot');
console.log('2. Check color accuracy against SMS palette');
console.log('3. Verify text rendering quality');
console.log('4. Test different frame timings');
console.log('5. Analyze VDP state for accuracy');
