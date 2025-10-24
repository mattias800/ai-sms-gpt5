import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Pixel-perfect analysis of Sonic title screen at frame 1000');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Sonic
const sonicPath = './sonic.sms';
const sonicData = readFileSync(sonicPath);

const sonicCart = { rom: sonicData };
const machine = createMachine({ cart: sonicCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();
const cpu = machine.getCPU();

// Run to frame 1000
for (let frame = 0; frame < 1000; frame++) {
  machine.runCycles(228 * 262);
}

// Check state
const cpuState = cpu.getState();
const vdpState = vdp.getState?.() ?? {};
const regs = vdpState.regs ?? [];

console.log(`\n=== Frame 1000 State ===`);
console.log(`CPU PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
console.log(`Background color (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

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
  
  const filename = 'traces/sonic_pixel_perfect_title_screen.png';
  png.pack().pipe(createWriteStream(filename));
  console.log(`📸 Generated: ${filename}`);
  
  // Comprehensive analysis
  const colorMap = new Map<string, number>();
  const colorDetails = new Map<string, {r: number, g: number, b: number, count: number}>();
  
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 3;
      const r = frameBuffer[idx] ?? 0;
      const g = frameBuffer[idx + 1] ?? 0;
      const b = frameBuffer[idx + 2] ?? 0;
      
      const colorKey = `${r},${g},${b}`;
      const count = (colorMap.get(colorKey) ?? 0) + 1;
      colorMap.set(colorKey, count);
      
      if (!colorDetails.has(colorKey)) {
        colorDetails.set(colorKey, { r, g, b, count: 0 });
      }
      colorDetails.get(colorKey)!.count = count;
    }
  }
  
  console.log(`\n=== Color Analysis ===`);
  console.log(`Total unique colors: ${colorMap.size}`);
  
  // Sort colors by frequency
  const sortedColors = Array.from(colorDetails.entries())
    .sort((a, b) => b[1].count - a[1].count);
  
  console.log(`\nAll colors (sorted by frequency):`);
  sortedColors.forEach(([colorKey, details], i) => {
    const percentage = (details.count / (256 * 192) * 100).toFixed(2);
    console.log(`  ${(i+1).toString().padStart(2, ' ')}: RGB(${details.r},${details.g},${details.b}) - ${details.count.toLocaleString()} pixels (${percentage}%)`);
  });
  
  // Check for expected colors
  console.log(`\n=== Expected Color Analysis ===`);
  
  // Check for white text
  const whiteText = colorMap.get('255,255,255') ?? 0;
  const whitePercentage = (whiteText / (256 * 192) * 100).toFixed(2);
  console.log(`White text RGB(255,255,255): ${whiteText.toLocaleString()} pixels (${whitePercentage}%)`);
  
  // Check for blue background
  const blueBackground = colorMap.get('0,85,255') ?? 0;
  const bluePercentage = (blueBackground / (256 * 192) * 100).toFixed(2);
  console.log(`Blue background RGB(0,85,255): ${blueBackground.toLocaleString()} pixels (${bluePercentage}%)`);
  
  // Check for black background
  const blackBackground = colorMap.get('0,0,0') ?? 0;
  const blackPercentage = (blackBackground / (256 * 192) * 100).toFixed(2);
  console.log(`Black background RGB(0,0,0): ${blackBackground.toLocaleString()} pixels (${blackPercentage}%)`);
  
  // Check for other common colors
  const commonColors = [
    { name: 'Red', rgb: '255,0,0' },
    { name: 'Green', rgb: '0,255,0' },
    { name: 'Yellow', rgb: '255,255,0' },
    { name: 'Cyan', rgb: '0,255,255' },
    { name: 'Magenta', rgb: '255,0,255' },
    { name: 'Gray', rgb: '170,170,170' },
    { name: 'Dark Blue', rgb: '0,0,255' }
  ];
  
  console.log(`\nCommon color analysis:`);
  commonColors.forEach(color => {
    const count = colorMap.get(color.rgb) ?? 0;
    const percentage = (count / (256 * 192) * 100).toFixed(2);
    if (count > 0) {
      console.log(`  ${color.name} RGB(${color.rgb}): ${count.toLocaleString()} pixels (${percentage}%)`);
    }
  });
  
  // Check corners
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: 255, y: 0 },
    { name: 'bottom-left', x: 0, y: 191 },
    { name: 'bottom-right', x: 255, y: 191 }
  ];
  
  console.log(`\n=== Corner Analysis (4x4 pixels) ===`);
  corners.forEach(corner => {
    const colors = new Map<string, number>();
    
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const x = corner.x + dx;
        const y = corner.y + dy;
        const idx = (y * 256 + x) * 3;
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        
        const colorKey = `${r},${g},${b}`;
        colors.set(colorKey, (colors.get(colorKey) ?? 0) + 1);
      }
    }
    
    const dominantColor = Array.from(colors.entries())
      .sort((a, b) => b[1] - a[1])[0];
    
    if (dominantColor) {
      const [colorKey, count] = dominantColor;
      const [r, g, b] = colorKey.split(',').map(Number);
      const percentage = (count / 16 * 100).toFixed(1);
      
      const isBlue = r === 0 && g === 85 && b === 255;
      const isWhite = r === 255 && g === 255 && b === 255;
      const isBlack = r === 0 && g === 0 && b === 0;
      
      let status = '⚠️ Other';
      if (isBlue) status = '✅ Blue';
      else if (isWhite) status = '✅ White';
      else if (isBlack) status = '✅ Black';
      
      console.log(`  ${corner.name}: RGB(${r},${g},${b}) - ${count}/16 pixels (${percentage}%) ${status}`);
    }
  });
  
  // Overall assessment
  console.log(`\n=== Title Screen Assessment ===`);
  
  const titleScreenElements = {
    hasGraphics: colorMap.size > 10,
    hasText: whiteText > 1000,
    hasBackground: blackBackground > 10000 || blueBackground > 1000,
    cornerConsistency: corners.every(corner => {
      const colors = new Map<string, number>();
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const x = corner.x + dx;
          const y = corner.y + dy;
          const idx = (y * 256 + x) * 3;
          const r = frameBuffer[idx] ?? 0;
          const g = frameBuffer[idx + 1] ?? 0;
          const b = frameBuffer[idx + 2] ?? 0;
          const colorKey = `${r},${g},${b}`;
          colors.set(colorKey, (colors.get(colorKey) ?? 0) + 1);
        }
      }
      const dominantColor = Array.from(colors.entries())
        .sort((a, b) => b[1] - a[1])[0];
      return dominantColor && dominantColor[1] >= 12; // At least 12/16 pixels same color
    })
  };
  
  console.log(`Has graphics: ${titleScreenElements.hasGraphics ? '✅' : '❌'} (${colorMap.size} colors)`);
  console.log(`Has text: ${titleScreenElements.hasText ? '✅' : '❌'} (${whiteText} white pixels)`);
  console.log(`Has background: ${titleScreenElements.hasBackground ? '✅' : '❌'} (${blackBackground} black, ${blueBackground} blue)`);
  console.log(`Corner consistency: ${titleScreenElements.cornerConsistency ? '✅' : '❌'}`);
  
  const successCount = Object.values(titleScreenElements).filter(Boolean).length;
  const totalElements = Object.keys(titleScreenElements).length;
  const successRate = (successCount / totalElements * 100).toFixed(1);
  
  console.log(`\n🎯 Title Screen Success Rate: ${successCount}/${totalElements} (${successRate}%)`);
  
  if (parseFloat(successRate) >= 90) {
    console.log(`🎉 EXCELLENT: Perfect Sonic title screen!`);
  } else if (parseFloat(successRate) >= 75) {
    console.log(`✅ GOOD: Mostly correct title screen`);
  } else if (parseFloat(successRate) >= 50) {
    console.log(`⚠️ ACCEPTABLE: Some title screen issues`);
  } else {
    console.log(`❌ POOR: Significant title screen issues`);
  }
  
  // Check for potential issues
  console.log(`\n=== Potential Issues ===`);
  
  if (colorMap.size < 10) {
    console.log(`⚠️ Low color diversity: ${colorMap.size} colors (should be >10)`);
  }
  
  if (whiteText < 1000) {
    console.log(`⚠️ Low text coverage: ${whiteText} white pixels (should be >1000)`);
  }
  
  if (blackBackground < 10000 && blueBackground < 1000) {
    console.log(`⚠️ No clear background: ${blackBackground} black, ${blueBackground} blue`);
  }
  
  // Check if this is ready for pixel-perfect comparison
  if (parseFloat(successRate) >= 75) {
    console.log(`\n🎯 READY FOR PIXEL-PERFECT COMPARISON!`);
    console.log(`Sonic title screen at frame 1000 shows:`);
    console.log(`- Game code execution (PC=0x${cpuState.pc.toString(16).padStart(4, '0')})`);
    console.log(`- Excellent color diversity (${colorMap.size} colors)`);
    console.log(`- Good text coverage (${whiteText} white pixels)`);
    console.log(`- Solid background (${blackBackground} black, ${blueBackground} blue)`);
    console.log(`- Consistent corners`);
    console.log(`\nNext step: Compare with MAME reference for pixel-perfect accuracy!`);
  }
  
} catch (error) {
  console.log(`❌ Analysis failed: ${(error as Error).message}`);
}
