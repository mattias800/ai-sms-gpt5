import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing corrected palette conversion');

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

// Generate screenshot with current palette
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
    
    const filename = 'traces/spy_vs_spy_current_palette.png';
    png.pack().pipe(createWriteStream(filename));
    console.log(`📸 Saved current palette: ${filename}`);
    
    // Analyze current colors
    const colorMap = new Map<string, number>();
    for (let i = 0; i < 256 * 192; i++) {
      const srcIdx = i * 3;
      const r = frameBuffer[srcIdx] ?? 0;
      const g = frameBuffer[srcIdx + 1] ?? 0;
      const b = frameBuffer[srcIdx + 2] ?? 0;
      
      const colorKey = `${r},${g},${b}`;
      colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
    }
    
    console.log('\nCurrent color analysis:');
    const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
    sortedColors.forEach(([color, count], i) => {
      const [r, g, b] = color.split(',').map(Number);
      const percentage = (count / (256 * 192) * 100).toFixed(2);
      console.log(`  ${(i+1).toString().padStart(2, ' ')}: RGB(${r},${g},${b}) - ${percentage}%`);
    });
    
    // Check if we have the expected colors
    const expectedColors = [
      { name: 'Background Blue', rgb: [0, 85, 255] },
      { name: 'Text White', rgb: [255, 255, 255] },
      { name: 'Accent Yellow', rgb: [255, 255, 0] }
    ];
    
    console.log('\nExpected color check:');
    expectedColors.forEach(expected => {
      const found = colorMap.has(`${expected.rgb[0]},${expected.rgb[1]},${expected.rgb[2]}`);
      const count = colorMap.get(`${expected.rgb[0]},${expected.rgb[1]},${expected.rgb[2]}`) ?? 0;
      const percentage = (count / (256 * 192) * 100).toFixed(2);
      console.log(`  ${found ? '✅' : '❌'} ${expected.name}: ${found ? `${count} pixels (${percentage}%)` : 'Not found'}`);
    });
    
  }
} catch (error) {
  console.log('Screenshot generation failed:', (error as Error).message);
}

// Check VDP state
const vdpState = vdp.getState?.() ?? {};
const cram = vdpState.cram ?? [];

console.log('\nCRAM analysis:');
console.log('Key CRAM entries:');
const keyEntries = [0, 1, 8, 12]; // Background, text, accent colors
keyEntries.forEach(i => {
  const value = cram[i] ?? 0;
  const r = ((value & 0x03) * 85) & 0xff;
  const g = (((value >> 2) & 0x03) * 85) & 0xff;
  const b = (((value >> 4) & 0x03) * 85) & 0xff;
  console.log(`  CRAM[${i}]: 0x${value.toString(16).padStart(2, '0')} → RGB(${r},${g},${b})`);
});

console.log('\n=== Analysis ===');
console.log('The current palette conversion appears to be working correctly.');
console.log('The issue might be:');
console.log('1. Wrong CRAM values being set by Spy vs Spy');
console.log('2. Different palette format than expected');
console.log('3. VDP register configuration issue');
console.log('4. Timing issue with when colors are set');
