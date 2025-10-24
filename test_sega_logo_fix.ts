import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing SEGA logo removal fix for Spy vs Spy');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();
const cpu = machine.getCPU();

// Run to frame 700 (after BIOS auto-disable and VRAM clearing)
for (let frame = 0; frame < 700; frame++) {
  machine.runCycles(228 * 262);
}

// Check final state
const cpuState = cpu.getState();
const vdpState = vdp.getState?.() ?? {};
const regs = vdpState.regs ?? [];

console.log(`\n=== Final State ===`);
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
  
  const filename = 'traces/spy_vs_spy_sega_logo_fixed.png';
  png.pack().pipe(createWriteStream(filename));
  console.log(`📸 Generated: ${filename}`);
  
  // Analyze the screenshot
  const colorMap = new Map<string, number>();
  const segaLogoPixels = [];
  const whitePixels = [];
  
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 3;
      const r = frameBuffer[idx] ?? 0;
      const g = frameBuffer[idx + 1] ?? 0;
      const b = frameBuffer[idx + 2] ?? 0;
      
      const colorKey = `${r},${g},${b}`;
      colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
      
      if (r === 255 && g === 255 && b === 255) {
        whitePixels.push({ x, y });
        
        // Check if this is in the SEGA logo area
        if (x >= 80 && x <= 176 && y >= 40 && y <= 80) {
          segaLogoPixels.push({ x, y });
        }
      }
    }
  }
  
  console.log(`\n=== Screenshot Analysis ===`);
  console.log(`Total unique colors: ${colorMap.size}`);
  console.log(`White pixels: ${whitePixels.length}`);
  console.log(`SEGA logo area pixels: ${segaLogoPixels.length}`);
  
  // Check if SEGA logo is gone
  if (segaLogoPixels.length < 100) {
    console.log(`✅ SUCCESS: SEGA logo removed!`);
  } else {
    console.log(`❌ FAILED: SEGA logo still visible (${segaLogoPixels.length} pixels)`);
  }
  
  // Check for blue background
  const bluePixels = colorMap.get('0,85,255') ?? 0;
  const bluePercentage = (bluePixels / (256 * 192) * 100).toFixed(2);
  console.log(`Blue background: ${bluePixels.toLocaleString()} pixels (${bluePercentage}%)`);
  
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
    
    const isBlue = r === 0 && g === 85 && b === 255;
    const isWhite = r === 255 && g === 255 && b === 255;
    const isBlack = r === 0 && g === 0 && b === 0;
    
    let status = '⚠️ Other';
    if (isBlue) status = '✅ Blue';
    else if (isWhite) status = '✅ White';
    else if (isBlack) status = '✅ Black';
    
    console.log(`  ${corner.name}: RGB(${r},${g},${b}) ${status}`);
  });
  
  // Overall assessment
  console.log(`\n=== Fix Assessment ===`);
  
  if (segaLogoPixels.length < 100 && bluePercentage > 70) {
    console.log(`🎉 EXCELLENT: SEGA logo removed and blue background restored!`);
  } else if (segaLogoPixels.length < 100) {
    console.log(`✅ GOOD: SEGA logo removed, but background needs work`);
  } else {
    console.log(`❌ POOR: SEGA logo still visible`);
  }
  
  // Check if we have proper title screen elements
  const titleScreenElements = {
    blueBackground: bluePercentage > 70,
    noSegaLogo: segaLogoPixels.length < 100,
    hasText: whitePixels.length > 1000,
    cornerConsistency: corners.every(corner => {
      const idx = (corner.y * 256 + corner.x) * 3;
      const r = frameBuffer[idx] ?? 0;
      const g = frameBuffer[idx + 1] ?? 0;
      const b = frameBuffer[idx + 2] ?? 0;
      return r === 0 && g === 85 && b === 255; // All corners blue
    })
  };
  
  console.log(`\n=== Title Screen Elements ===`);
  console.log(`Blue background: ${titleScreenElements.blueBackground ? '✅' : '❌'}`);
  console.log(`No SEGA logo: ${titleScreenElements.noSegaLogo ? '✅' : '❌'}`);
  console.log(`Has text: ${titleScreenElements.hasText ? '✅' : '❌'}`);
  console.log(`Corner consistency: ${titleScreenElements.cornerConsistency ? '✅' : '❌'}`);
  
  const successCount = Object.values(titleScreenElements).filter(Boolean).length;
  const totalElements = Object.keys(titleScreenElements).length;
  const successRate = (successCount / totalElements * 100).toFixed(1);
  
  console.log(`\n🎯 Title Screen Success Rate: ${successCount}/${totalElements} (${successRate}%)`);
  
  if (parseFloat(successRate) >= 90) {
    console.log(`🎉 EXCELLENT: Perfect Spy vs Spy title screen!`);
  } else if (parseFloat(successRate) >= 75) {
    console.log(`✅ GOOD: Mostly correct title screen`);
  } else if (parseFloat(successRate) >= 50) {
    console.log(`⚠️ ACCEPTABLE: Some title screen issues`);
  } else {
    console.log(`❌ POOR: Significant title screen issues`);
  }
  
} catch (error) {
  console.log(`❌ Test failed: ${(error as Error).message}`);
}
