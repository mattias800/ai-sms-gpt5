import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing Sonic title screen with extended frames');

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

// Test different frame counts
const testFrames = [300, 400, 500, 600, 700, 800];

for (const targetFrame of testFrames) {
  console.log(`\n=== Frame ${targetFrame} Analysis ===`);
  
  // Run to target frame
  for (let frame = 0; frame < targetFrame; frame++) {
    machine.runCycles(228 * 262);
  }
  
  // Check state
  const cpuState = cpu.getState();
  const vdpState = vdp.getState?.() ?? {};
  const regs = vdpState.regs ?? [];
  
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
      console.log(`  ❌ Failed to render frame`);
      continue;
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
    
    const filename = `traces/sonic_frame_${targetFrame}_analysis.png`;
    png.pack().pipe(createWriteStream(filename));
    console.log(`  📸 Generated: ${filename}`);
    
    // Quick analysis
    const colorMap = new Map<string, number>();
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
      }
    }
    
    console.log(`  Colors: ${colorMap.size}, White: ${whitePixels.length}, Blue: ${bluePixels.length}`);
    
    // Check if this looks like a title screen
    if (cpuState.pc >= 0x4000 && colorMap.size > 5 && whitePixels.length > 100) {
      console.log(`  🎯 POTENTIAL TITLE SCREEN!`);
      console.log(`  ✅ In game code`);
      console.log(`  ✅ Multiple colors (${colorMap.size})`);
      console.log(`  ✅ Has text (${whitePixels.length} white pixels)`);
      
      // This might be our target frame
      console.log(`  💡 This could be the optimal frame for Sonic title screen`);
    }
    
  } catch (error) {
    console.log(`  ❌ Screenshot failed: ${(error as Error).message}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Tested frames: ${testFrames.join(', ')}`);
console.log(`Check the generated screenshots to find the best title screen frame.`);
console.log(`Look for frames that show:`);
console.log(`- Game code execution (PC >= 0x4000)`);
console.log(`- Multiple colors (>5)`);
console.log(`- Text/graphics (white pixels >100)`);
console.log(`- Proper background`);
