import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Analyzing why frame 1300 looks perfect');

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

// Run to frame 1300 (the perfect frame)
for (let frame = 0; frame < 1300; frame++) {
  machine.runCycles(228 * 262);
}

// Check state at frame 1300
const cpuState = cpu.getState();
const vdpState = vdp.getState?.() ?? {};
const regs = vdpState.regs ?? [];

console.log(`\n=== Frame 1300 State ===`);
console.log(`CPU PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
console.log(`Background color (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

// Check VDP table addresses
const nameTableAddr = ((regs[2] ?? 0) << 10) & 0x3C00;
const patternTableAddr = ((regs[4] ?? 0) << 11) & 0x3800;

console.log(`VDP Table Addresses:`);
console.log(`  Name Table: 0x${nameTableAddr.toString(16).padStart(4, '0')}`);
console.log(`  Pattern Table: 0x${patternTableAddr.toString(16).padStart(4, '0')}`);

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
  
  const filename = 'traces/spy_vs_spy_frame_1300_analysis.png';
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
  
  // Check if this is the perfect frame
  console.log(`\n=== Perfect Frame Assessment ===`);
  
  if (segaLogoPixels.length < 100 && bluePercentage > 70 && whitePixels.length > 1000) {
    console.log(`🎉 PERFECT: This frame has everything we want!`);
    console.log(`✅ No SEGA logo`);
    console.log(`✅ Blue background`);
    console.log(`✅ Good text coverage`);
  } else {
    console.log(`⚠️ Not perfect:`);
    if (segaLogoPixels.length >= 100) console.log(`  ❌ SEGA logo still visible (${segaLogoPixels.length} pixels)`);
    if (bluePercentage <= 70) console.log(`  ❌ Blue background insufficient (${bluePercentage}%)`);
    if (whitePixels.length <= 1000) console.log(`  ❌ Text coverage insufficient (${whitePixels.length} pixels)`);
  }
  
  // Check VRAM state
  const vram = vdpState.vram;
  if (vram) {
    let nonZeroBytes = 0;
    for (let i = 0; i < vram.length; i++) {
      if (vram[i] !== 0) {
        nonZeroBytes++;
      }
    }
    
    console.log(`\nVRAM State:`);
    console.log(`  Non-zero bytes: ${nonZeroBytes}/${vram.length} (${(nonZeroBytes / vram.length * 100).toFixed(2)}%)`);
    
    // Check if VRAM has been properly set up by the game
    if (nonZeroBytes > 1000) {
      console.log(`✅ VRAM properly populated by game`);
    } else {
      console.log(`❌ VRAM mostly empty`);
    }
  }
  
  // Check if this is the optimal frame
  console.log(`\n=== Optimal Frame Analysis ===`);
  console.log(`Frame 1300 characteristics:`);
  console.log(`- CPU in game code: ${cpuState.pc >= 0x4000 ? '✅' : '❌'}`);
  console.log(`- Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
  console.log(`- Blue background: ${bluePercentage}%`);
  console.log(`- SEGA logo removed: ${segaLogoPixels.length < 100 ? '✅' : '❌'}`);
  console.log(`- Text coverage: ${whitePixels.length} pixels`);
  
  if (segaLogoPixels.length < 100 && bluePercentage > 70 && whitePixels.length > 1000) {
    console.log(`\n🎯 RECOMMENDATION: Use frame 1300 as the optimal frame!`);
    console.log(`This frame has:`);
    console.log(`- No SEGA logo`);
    console.log(`- Proper blue background`);
    console.log(`- Good text coverage`);
    console.log(`- Game graphics properly rendered`);
  }
  
} catch (error) {
  console.log(`❌ Analysis failed: ${(error as Error).message}`);
}
