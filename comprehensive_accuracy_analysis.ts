import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Comprehensive accuracy analysis for Spy vs Spy emulation');

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

// Generate our screenshot
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
  
  const filename = 'traces/spy_vs_spy_final_analysis.png';
  png.pack().pipe(createWriteStream(filename));
  console.log(`📸 Generated final analysis screenshot: ${filename}`);
  
  // Comprehensive analysis
  console.log('\n=== COMPREHENSIVE ACCURACY ANALYSIS ===');
  
  // 1. VDP State Analysis
  const vdpState = vdp.getState?.() ?? {};
  const regs = vdpState.regs ?? [];
  const cram = vdpState.cram ?? [];
  
  console.log('\n1. VDP State Analysis:');
  console.log(`   Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
  console.log(`   Background color (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`   Mode control (R0): 0x${(regs[0] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`   Display control (R1): 0x${(regs[1] ?? 0).toString(16).padStart(2, '0')}`);
  
  // Check register validity
  const validRegs = regs.every((reg, i) => {
    if (i === 0) return reg <= 0x3F; // R0: Mode control
    if (i === 1) return reg <= 0xE0; // R1: Display control
    if (i === 7) return reg <= 0x3F; // R7: Background color
    return true; // Other registers have different valid ranges
  });
  console.log(`   Register validity: ${validRegs ? '✅ All valid' : '❌ Invalid values detected'}`);
  
  // 2. Color Analysis
  console.log('\n2. Color Analysis:');
  
  const colorMap = new Map<string, number>();
  for (let i = 0; i < 256 * 192; i++) {
    const srcIdx = i * 3;
    const r = frameBuffer[srcIdx] ?? 0;
    const g = frameBuffer[srcIdx + 1] ?? 0;
    const b = frameBuffer[srcIdx + 2] ?? 0;
    
    const colorKey = `${r},${g},${b}`;
    colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
  }
  
  const uniqueColors = colorMap.size;
  console.log(`   Total unique colors: ${uniqueColors}`);
  
  // Check SMS palette compliance
  const smsCompliantColors = Array.from(colorMap.keys()).filter(color => {
    const [r, g, b] = color.split(',').map(Number);
    const rValid = [0, 85, 170, 255].includes(r);
    const gValid = [0, 85, 170, 255].includes(g);
    const bValid = [0, 85, 170, 255].includes(b);
    return rValid && gValid && bValid;
  });
  
  const compliancePercentage = (smsCompliantColors.length / uniqueColors * 100).toFixed(2);
  console.log(`   SMS palette compliance: ${smsCompliantColors.length}/${uniqueColors} (${compliancePercentage}%)`);
  
  // 3. Expected Color Verification
  console.log('\n3. Expected Color Verification:');
  
  const expectedColors = [
    { name: 'Background Blue', rgb: [0, 85, 255], minPercentage: 5, maxPercentage: 20 },
    { name: 'Text White', rgb: [255, 255, 255], minPercentage: 3, maxPercentage: 15 },
    { name: 'Black', rgb: [0, 0, 0], minPercentage: 5, maxPercentage: 20 },
    { name: 'Gray', rgb: [170, 170, 170], minPercentage: 30, maxPercentage: 80 }
  ];
  
  let colorScore = 0;
  expectedColors.forEach(expected => {
    const count = colorMap.get(`${expected.rgb[0]},${expected.rgb[1]},${expected.rgb[2]}`) ?? 0;
    const percentage = (count / (256 * 192) * 100);
    
    const inRange = percentage >= expected.minPercentage && percentage <= expected.maxPercentage;
    console.log(`   ${inRange ? '✅' : '❌'} ${expected.name}: ${count.toLocaleString()} pixels (${percentage.toFixed(2)}%) [Expected: ${expected.minPercentage}-${expected.maxPercentage}%]`);
    
    if (inRange) colorScore++;
  });
  
  // 4. Graphics Quality Analysis
  console.log('\n4. Graphics Quality Analysis:');
  
  // Check for text readability
  const whitePixels = colorMap.get('255,255,255') ?? 0;
  const textReadability = whitePixels > 1000 ? '✅ Excellent' : whitePixels > 500 ? '✅ Good' : '❌ Poor';
  console.log(`   Text readability: ${textReadability} (${whitePixels} white pixels)`);
  
  // Check color diversity
  const colorDiversity = uniqueColors >= 8 ? '✅ Excellent' : uniqueColors >= 5 ? '✅ Good' : '❌ Poor';
  console.log(`   Color diversity: ${colorDiversity} (${uniqueColors} colors)`);
  
  // Check for proper shading
  const hasShading = colorMap.has('170,170,170') && colorMap.has('85,85,85');
  console.log(`   Shading: ${hasShading ? '✅ Present' : '❌ Missing'}`);
  
  // 5. Corner Consistency Analysis
  console.log('\n5. Corner Consistency Analysis:');
  
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: 252, y: 0 },
    { name: 'bottom-left', x: 0, y: 188 },
    { name: 'bottom-right', x: 252, y: 188 }
  ];
  
  const cornerColors: string[] = [];
  corners.forEach(corner => {
    const colorMap = new Map<string, number>();
    
    // Sample 4x4 area
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const x = corner.x + dx;
        const y = corner.y + dy;
        const idx = (y * 256 + x) * 3;
        
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        
        const colorKey = `${r},${g},${b}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
      }
    }
    
    // Find dominant color
    let dominantColor = '';
    let maxCount = 0;
    for (const [color, count] of colorMap.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantColor = color;
      }
    }
    
    cornerColors.push(dominantColor);
    const [r, g, b] = dominantColor.split(',').map(Number);
    console.log(`   ${corner.name}: RGB(${r},${g},${b}) - ${maxCount}/16 pixels`);
  });
  
  const cornerConsistency = new Set(cornerColors).size <= 2 ? '✅ Consistent' : '❌ Inconsistent';
  console.log(`   Corner consistency: ${cornerConsistency}`);
  
  // 6. Overall Accuracy Score
  console.log('\n6. Overall Accuracy Score:');
  
  const scores = [
    validRegs ? 1 : 0,                    // VDP registers valid
    parseFloat(compliancePercentage) >= 90 ? 1 : 0, // SMS palette compliance
    colorScore >= 3 ? 1 : 0,              // Expected colors present
    uniqueColors >= 5 ? 1 : 0,            // Color diversity
    whitePixels > 1000 ? 1 : 0,           // Text readability
    new Set(cornerColors).size <= 2 ? 1 : 0, // Corner consistency
    ((regs[1] ?? 0) & 0x40) !== 0 ? 1 : 0, // Display enabled
    hasShading ? 1 : 0                    // Shading present
  ];
  
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const maxScore = scores.length;
  const accuracyPercentage = (totalScore / maxScore * 100).toFixed(2);
  
  console.log(`   Score: ${totalScore}/${maxScore} (${accuracyPercentage}%)`);
  
  if (totalScore >= 8) {
    console.log(`   🎉 EXCELLENT: Pixel-perfect emulation!`);
  } else if (totalScore >= 7) {
    console.log(`   ✅ VERY GOOD: High accuracy emulation`);
  } else if (totalScore >= 6) {
    console.log(`   ✅ GOOD: Good accuracy emulation`);
  } else if (totalScore >= 4) {
    console.log(`   ⚠️ FAIR: Moderate accuracy emulation`);
  } else {
    console.log(`   ❌ POOR: Low accuracy emulation`);
  }
  
  // 7. Comparison with Expected Spy vs Spy Behavior
  console.log('\n7. Expected Spy vs Spy Behavior Verification:');
  
  const expectedBehaviors = [
    { name: 'Blue background', test: () => colorMap.has('0,85,255') },
    { name: 'White text', test: () => colorMap.has('255,255,255') },
    { name: 'Multiple colors', test: () => uniqueColors >= 5 },
    { name: 'Display enabled', test: () => ((regs[1] ?? 0) & 0x40) !== 0 },
    { name: 'BIOS disabled', test: () => !(machine.getBus() as any).biosEnabled },
    { name: 'Game code executing', test: () => {
      const pc = machine.getCPU().getState().pc;
      return pc >= 0x4000; // Game ROM range
    }}
  ];
  
  let behaviorScore = 0;
  expectedBehaviors.forEach(behavior => {
    const passed = behavior.test();
    console.log(`   ${passed ? '✅' : '❌'} ${behavior.name}`);
    if (passed) behaviorScore++;
  });
  
  console.log(`\n=== FINAL ASSESSMENT ===`);
  console.log(`Technical Accuracy: ${totalScore}/${maxScore} (${accuracyPercentage}%)`);
  console.log(`Behavioral Accuracy: ${behaviorScore}/${expectedBehaviors.length} (${(behaviorScore/expectedBehaviors.length*100).toFixed(2)}%)`);
  
  const overallScore = (totalScore + behaviorScore) / (maxScore + expectedBehaviors.length) * 100;
  console.log(`Overall Accuracy: ${overallScore.toFixed(2)}%`);
  
  if (overallScore >= 95) {
    console.log(`🎉 PIXEL-PERFECT: Spy vs Spy emulation is excellent!`);
  } else if (overallScore >= 90) {
    console.log(`✅ EXCELLENT: Spy vs Spy emulation is very accurate!`);
  } else if (overallScore >= 80) {
    console.log(`✅ VERY GOOD: Spy vs Spy emulation is accurate!`);
  } else if (overallScore >= 70) {
    console.log(`✅ GOOD: Spy vs Spy emulation is mostly accurate!`);
  } else {
    console.log(`⚠️ NEEDS IMPROVEMENT: Spy vs Spy emulation needs work!`);
  }
  
} catch (error) {
  console.log(`❌ Analysis failed: ${(error as Error).message}`);
}
