import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing Spy vs Spy background color fix');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Run to optimal frame (700)
for (let frame = 0; frame < 700; frame++) {
  machine.runCycles(228 * 262);
}

// Check VDP state
const vdpState = vdp.getState?.() ?? {};
const regs = vdpState.regs ?? [];
const cram = vdpState.cram ?? [];

console.log('VDP State After Fix:');
console.log(`  Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
console.log(`  Background color register (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

// Check what background color R7 points to
const r7 = regs[7] ?? 0;
const bgColorIndex = r7 & 0x0F;
const bgCramValue = cram[bgColorIndex] ?? 0;
const bgR = ((bgCramValue & 0x03) * 85) & 0xff;
const bgG = (((bgCramValue >> 2) & 0x03) * 85) & 0xff;
const bgB = (((bgCramValue >> 4) & 0x03) * 85) & 0xff;

console.log(`  R7 points to CRAM[${bgColorIndex}] = 0x${bgCramValue.toString(16).padStart(2, '0')} → RGB(${bgR},${bgG},${bgB})`);

// Check if this is blue
const isBlue = bgR === 0 && bgG === 85 && bgB === 255;
console.log(`  Background is blue: ${isBlue ? '✅' : '❌'}`);

// Generate screenshot
try {
  mkdirSync('traces', { recursive: true });
  
  const frameBuffer = vdp.renderFrame();
  if (!frameBuffer) {
    console.log('❌ Failed to render frame');
    process.exit(1);
  }

  const png = new PNG({ width: 256, height: 192 });
  for (let i = 0; i < 256 * 192; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    png.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
    png.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
    png.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
    png.data[dstIdx + 3] = 255;
  }
  
  const filename = 'traces/spy_vs_spy_background_fixed.png';
  png.pack().pipe(createWriteStream(filename));
  console.log(`📸 Generated fixed screenshot: ${filename}`);
  
  // Analyze the screenshot
  const colorMap = new Map<string, number>();
  for (let i = 0; i < 256 * 192; i++) {
    const srcIdx = i * 3;
    const r = frameBuffer[srcIdx] ?? 0;
    const g = frameBuffer[srcIdx + 1] ?? 0;
    const b = frameBuffer[srcIdx + 2] ?? 0;
    
    const colorKey = `${r},${g},${b}`;
    colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
  }
  
  console.log(`\n=== Screenshot Analysis ===`);
  console.log(`Total unique colors: ${colorMap.size}`);
  
  // Check for blue background
  const bluePixels = colorMap.get('0,85,255') ?? 0;
  const bluePercentage = (bluePixels / (256 * 192) * 100).toFixed(2);
  console.log(`Blue background pixels: ${bluePixels.toLocaleString()} (${bluePercentage}%)`);
  
  // Check for gray background
  const grayPixels = colorMap.get('170,170,170') ?? 0;
  const grayPercentage = (grayPixels / (256 * 192) * 100).toFixed(2);
  console.log(`Gray background pixels: ${grayPixels.toLocaleString()} (${grayPercentage}%)`);
  
  // Check corners
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: 255, y: 0 },
    { name: 'bottom-left', x: 0, y: 191 },
    { name: 'bottom-right', x: 255, y: 191 }
  ];
  
  console.log(`\nCorner Analysis:`);
  corners.forEach(corner => {
    const idx = (corner.y * 256 + corner.x) * 3;
    const r = frameBuffer[idx] ?? 0;
    const g = frameBuffer[idx + 1] ?? 0;
    const b = frameBuffer[idx + 2] ?? 0;
    
    const isBlueCorner = r === 0 && g === 85 && b === 255;
    const isGrayCorner = r === 170 && g === 170 && b === 170;
    
    console.log(`  ${corner.name}: RGB(${r},${g},${b}) ${isBlueCorner ? '✅ Blue' : isGrayCorner ? '❌ Gray' : '⚠️ Other'}`);
  });
  
  // Overall assessment
  console.log(`\n=== Fix Assessment ===`);
  
  if (isBlue && bluePixels > grayPixels) {
    console.log(`🎉 SUCCESS: Background is now blue!`);
    console.log(`✅ R7 points to blue color`);
    console.log(`✅ Blue pixels dominate over gray pixels`);
  } else if (isBlue) {
    console.log(`⚠️ PARTIAL: R7 is correct but gray still dominates`);
  } else {
    console.log(`❌ FAILED: Background is still not blue`);
  }
  
} catch (error) {
  console.log(`❌ Test failed: ${(error as Error).message}`);
}
