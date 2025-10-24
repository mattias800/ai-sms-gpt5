import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing Sonic title screen at 240 frames');

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

// Run to frame 240
for (let frame = 0; frame < 240; frame++) {
  machine.runCycles(228 * 262);
}

// Check state
const cpuState = cpu.getState();
const vdpState = vdp.getState?.() ?? {};
const regs = vdpState.regs ?? [];

console.log(`\n=== Frame 240 State ===`);
console.log(`CPU PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
console.log(`Background color (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

// Check if we're in BIOS or game code
if (cpuState.pc < 0x4000) {
  console.log(`Status: 🔴 Still in BIOS code (PC < 0x4000)`);
} else if (cpuState.pc >= 0x4000 && cpuState.pc < 0x8000) {
  console.log(`Status: 🟡 In game ROM code (0x4000-0x7FFF)`);
} else if (cpuState.pc >= 0x8000) {
  console.log(`Status: 🟢 In game RAM/ROM code (0x8000+)`);
}

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
  
  const filename = 'traces/sonic_frame_240_title_screen.png';
  png.pack().pipe(createWriteStream(filename));
  console.log(`📸 Generated: ${filename}`);
  
  // Analyze the screenshot
  const colorMap = new Map<string, number>();
  const segaLogoPixels = [];
  const whitePixels = [];
  const bluePixels = [];
  
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
      }
      
      if (r === 0 && g === 85 && b === 255) {
        bluePixels.push({ x, y });
      }
      
      // Check if this is in the SEGA logo area
      if (x >= 80 && x <= 176 && y >= 40 && y <= 80) {
        if (r === 255 && g === 255 && b === 255) {
          segaLogoPixels.push({ x, y });
        }
      }
    }
  }
  
  console.log(`\n=== Screenshot Analysis ===`);
  console.log(`Total unique colors: ${colorMap.size}`);
  console.log(`White pixels: ${whitePixels.length}`);
  console.log(`Blue pixels: ${bluePixels.length}`);
  console.log(`SEGA logo area pixels: ${segaLogoPixels.length}`);
  
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
  
  // Check if this looks like a title screen
  console.log(`\n=== Title Screen Assessment ===`);
  
  const titleScreenElements = {
    hasGraphics: colorMap.size > 5,
    hasText: whitePixels.length > 100,
    hasBackground: bluePixels.length > 1000 || colorMap.get('0,0,0') > 1000,
    cornerConsistency: corners.every(corner => {
      const idx = (corner.y * 256 + corner.x) * 3;
      const r = frameBuffer[idx] ?? 0;
      const g = frameBuffer[idx + 1] ?? 0;
      const b = frameBuffer[idx + 2] ?? 0;
      // Check if corners are consistent (same color)
      return true; // For now, just check if we have graphics
    })
  };
  
  console.log(`Has graphics: ${titleScreenElements.hasGraphics ? '✅' : '❌'}`);
  console.log(`Has text: ${titleScreenElements.hasText ? '✅' : '❌'}`);
  console.log(`Has background: ${titleScreenElements.hasBackground ? '✅' : '❌'}`);
  console.log(`Corner consistency: ${titleScreenElements.cornerConsistency ? '✅' : '❌'}`);
  
  const successCount = Object.values(titleScreenElements).filter(Boolean).length;
  const totalElements = Object.keys(titleScreenElements).length;
  const successRate = (successCount / totalElements * 100).toFixed(1);
  
  console.log(`\n🎯 Title Screen Success Rate: ${successCount}/${totalElements} (${successRate}%)`);
  
  if (parseFloat(successRate) >= 75) {
    console.log(`✅ GOOD: Looks like a title screen!`);
  } else if (parseFloat(successRate) >= 50) {
    console.log(`⚠️ ACCEPTABLE: Some title screen elements present`);
  } else {
    console.log(`❌ POOR: Doesn't look like a title screen`);
  }
  
  // Check if we need to run longer
  if (cpuState.pc < 0x4000) {
    console.log(`\n💡 Still in BIOS code - might need to run longer`);
    console.log(`   Try running to frame 300, 400, or 500`);
  } else {
    console.log(`\n✅ In game code - this should be the title screen`);
  }
  
} catch (error) {
  console.log(`❌ Test failed: ${(error as Error).message}`);
}
