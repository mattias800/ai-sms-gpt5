import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Comprehensive Spy vs Spy verification');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Helper function to analyze 4x4 corner areas
const analyzeCorners = (frameBuffer: Uint8Array): {success: boolean, details: string, cornerColors: string[]} => {
  const width = 256;
  const height = 192;
  
  // Define 4x4 corner areas
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: width - 4, y: 0 },
    { name: 'bottom-left', x: 0, y: height - 4 },
    { name: 'bottom-right', x: width - 4, y: height - 4 }
  ];
  
  const cornerColors: string[] = [];
  
  corners.forEach(corner => {
    const colorMap = new Map<string, number>();
    
    // Sample 4x4 area
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const x = corner.x + dx;
        const y = corner.y + dy;
        const idx = (y * width + x) * 3;
        
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
  });
  
  // Check if corners are consistent
  const uniqueColors = new Set(cornerColors);
  const isConsistent = uniqueColors.size <= 2; // Allow some variation
  
  const details = `Corners: ${corners.map((c, i) => `${c.name}=(${cornerColors[i]})`).join(', ')} | Unique: ${uniqueColors.size}`;
  
  return { success: isConsistent, details, cornerColors };
};

// Test multiple frame timings
const testFrames = [800, 900, 1000, 1100, 1200];
const results: Array<{frame: number, success: boolean, details: string}> = [];

console.log('Testing multiple frame timings...');

for (let frame = 0; frame < 1200; frame++) {
  machine.runCycles(228 * 262);
  
  if (testFrames.includes(frame)) {
    const vdpState = vdp.getState?.() ?? {};
    const displayEnabled = ((vdpState.regs?.[1] ?? 0) & 0x40) !== 0;
    const pc = machine.getCPU().getState().pc;
    const biosEnabled = (machine.getBus() as any).biosEnabled;
    const r7 = vdpState.regs?.[7] ?? 0;

    const frameBuffer = vdp.renderFrame();
    if (!frameBuffer) {
      results.push({ frame, success: false, details: `Failed to render frame ${frame}` });
      continue;
    }

    // Count colors
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
    const cornerAnalysis = analyzeCorners(frameBuffer);
    
    // Success criteria
    const hasEnoughColors = uniqueColors >= 4;
    const displayIsOn = displayEnabled;
    const biosIsOff = !biosEnabled;
    const hasValidR7 = r7 >= 0 && r7 <= 0x3F;
    const cornersAreConsistent = cornerAnalysis.success;

    const success = hasEnoughColors && displayIsOn && biosIsOff && hasValidR7 && cornersAreConsistent;

    const details = `PC=0x${pc.toString(16).padStart(4, '0')} Display=${displayEnabled ? 'ON' : 'OFF'} BIOS=${biosEnabled ? 'ON' : 'OFF'} R7=0x${r7.toString(16).padStart(2, '0')} Colors=${uniqueColors} | ${cornerAnalysis.details}`;

    results.push({ frame, success, details });
    
    console.log(`Frame ${frame}: ${success ? '✅ PASS' : '❌ FAIL'} - ${details}`);
  }
}

// Overall analysis
const successfulFrames = results.filter(r => r.success).length;
const totalFrames = results.length;

console.log(`\n=== Overall Results ===`);
console.log(`Successful frames: ${successfulFrames}/${totalFrames}`);

if (successfulFrames >= totalFrames * 0.8) {
  console.log('✅ OVERALL SUCCESS: Spy vs Spy is working correctly!');
} else if (successfulFrames >= totalFrames * 0.5) {
  console.log('⚠️ PARTIAL SUCCESS: Spy vs Spy is mostly working');
} else {
  console.log('❌ FAILURE: Spy vs Spy still has significant issues');
}

// Generate final screenshot
console.log('\nGenerating final verification screenshot...');
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
    
    const filename = 'traces/spy_vs_spy_comprehensive_verification.png';
    png.pack().pipe(createWriteStream(filename));
    console.log(`📸 Saved: ${filename}`);
    
    // Final color analysis
    const colorMap = new Map<string, number>();
    for (let i = 0; i < 256 * 192; i++) {
      const srcIdx = i * 3;
      const r = frameBuffer[srcIdx] ?? 0;
      const g = frameBuffer[srcIdx + 1] ?? 0;
      const b = frameBuffer[srcIdx + 2] ?? 0;
      
      const colorKey = `${r},${g},${b}`;
      colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
    }
    
    console.log('\nFinal color palette:');
    const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
    sortedColors.forEach(([color, count], i) => {
      const [r, g, b] = color.split(',').map(Number);
      const percentage = (count / (256 * 192) * 100).toFixed(2);
      console.log(`  ${(i+1).toString().padStart(2, ' ')}: RGB(${r},${g},${b}) - ${percentage}%`);
    });
  }
} catch (error) {
  console.log('Screenshot generation failed:', (error as Error).message);
}

console.log('\n✅ Comprehensive verification complete!');
