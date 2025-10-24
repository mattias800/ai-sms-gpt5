import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Analyzing Spy vs Spy timing for optimal title screen capture');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Track color count over time
const colorHistory: Array<{frame: number, colors: number, pc: number}> = [];

console.log('Running extended analysis to find optimal timing...');

// Run for 2000 frames to see the full cycle
for (let frame = 0; frame < 2000; frame++) {
  machine.runCycles(228 * 262);
  
  // Check every 50 frames
  if (frame % 50 === 0) {
    const frameBuffer = vdp.renderFrame();
    if (frameBuffer) {
      const colorMap = new Map<string, number>();
      for (let i = 0; i < 256 * 192; i++) {
        const srcIdx = i * 3;
        const r = frameBuffer[srcIdx] ?? 0;
        const g = frameBuffer[srcIdx + 1] ?? 0;
        const b = frameBuffer[srcIdx + 2] ?? 0;
        
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
      }
      
      const pc = machine.getCPU().getState().pc;
      const colors = colorMap.size;
      
      colorHistory.push({ frame, colors, pc });
      
      console.log(`Frame ${frame}: ${colors} colors, PC=0x${pc.toString(16).padStart(4, '0')}`);
    }
  }
}

// Find the optimal frame
console.log('\n=== Timing Analysis ===');

// Find frames with most colors (best title screen)
const maxColors = Math.max(...colorHistory.map(h => h.colors));
const bestFrames = colorHistory.filter(h => h.colors === maxColors);

console.log(`Maximum colors found: ${maxColors}`);
console.log(`Best frames: ${bestFrames.map(f => f.frame).join(', ')}`);

// Find frames with good color count (>= 5 colors)
const goodFrames = colorHistory.filter(h => h.colors >= 5);
console.log(`Frames with >= 5 colors: ${goodFrames.map(f => f.frame).join(', ')}`);

// Find the first frame with good colors
const firstGoodFrame = goodFrames[0];
if (firstGoodFrame) {
  console.log(`\n✅ Recommended frame: ${firstGoodFrame.frame} (${firstGoodFrame.colors} colors)`);
  
  // Generate screenshot at recommended frame
  console.log('\nGenerating screenshot at recommended frame...');
  
  // Reset machine
  const machine2 = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
  const vdp2 = machine2.getVDP();
  
  // Run to recommended frame
  for (let frame = 0; frame < firstGoodFrame.frame; frame++) {
    machine2.runCycles(228 * 262);
  }
  
  try {
    mkdirSync('traces', { recursive: true });
    
    const frameBuffer = vdp2.renderFrame();
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
      
      const filename = `traces/spy_vs_spy_optimal_frame_${firstGoodFrame.frame}.png`;
      png.pack().pipe(createWriteStream(filename));
      console.log(`📸 Saved: ${filename}`);
      
      // Analyze the optimal frame
      const colorMap = new Map<string, number>();
      for (let i = 0; i < 256 * 192; i++) {
        const srcIdx = i * 3;
        const r = frameBuffer[srcIdx] ?? 0;
        const g = frameBuffer[srcIdx + 1] ?? 0;
        const b = frameBuffer[srcIdx + 2] ?? 0;
        
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
      }
      
      console.log('\nOptimal frame color analysis:');
      const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
      sortedColors.forEach(([color, count], i) => {
        const [r, g, b] = color.split(',').map(Number);
        const percentage = (count / (256 * 192) * 100).toFixed(2);
        console.log(`  ${(i+1).toString().padStart(2, ' ')}: RGB(${r},${g},${b}) - ${percentage}%`);
      });
      
      // Check for expected colors
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
} else {
  console.log('❌ No good frames found');
}

console.log('\n✅ Timing analysis complete!');
