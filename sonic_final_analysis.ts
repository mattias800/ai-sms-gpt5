import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Final Sonic title screen analysis');

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

// Test multiple frames around the optimal range
const testFrames = [440, 450, 460, 470, 480, 490, 500];

let bestFrame = 0;
let bestScore = 0;
const results = [];

for (const targetFrame of testFrames) {
  console.log(`\n=== Frame ${targetFrame} ===`);
  
  // Create a fresh machine for each test
  const testMachine = createMachine({ cart: sonicCart, useManualInit: false, bus: { bios: biosData } });
  const testVdp = testMachine.getVDP();
  const testCpu = testMachine.getCPU();
  
  // Run to target frame
  for (let frame = 0; frame < targetFrame; frame++) {
    testMachine.runCycles(228 * 262);
  }
  
  // Check state
  const cpuState = testCpu.getState();
  const vdpState = testVdp.getState?.() ?? {};
  const regs = vdpState.regs ?? [];
  
  console.log(`CPU PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
  console.log(`Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
  
  // Check if we're in BIOS or game code
  let status = '🔴 BIOS';
  if (cpuState.pc >= 0x4000 && cpuState.pc < 0x8000) {
    status = '🟡 Game ROM';
  } else if (cpuState.pc >= 0x8000) {
    status = '🟢 Game RAM';
  }
  console.log(`Status: ${status}`);
  
  // Generate screenshot
  try {
    mkdirSync('traces', { recursive: true });
    
    const frameBuffer = testVdp.renderFrame();
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
    
    const filename = `traces/sonic_frame_${targetFrame}_final.png`;
    png.pack().pipe(createWriteStream(filename));
    console.log(`  📸 Generated: ${filename}`);
    
    // Quick analysis
    const colorMap = new Map<string, number>();
    const whitePixels = [];
    const bluePixels = [];
    const blackPixels = [];
    
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
        
        if (r === 0 && g === 0 && b === 0) {
          blackPixels.push({ x, y });
        }
      }
    }
    
    const colorCount = colorMap.size;
    const whiteCount = whitePixels.length;
    const blueCount = bluePixels.length;
    const blackCount = blackPixels.length;
    
    console.log(`  Colors: ${colorCount}, White: ${whiteCount}, Blue: ${blueCount}, Black: ${blackCount}`);
    
    // Calculate score
    let score = 0;
    
    // Bonus for being in game code
    if (cpuState.pc >= 0x4000) {
      score += 50;
    }
    
    // Bonus for color diversity
    if (colorCount > 10) {
      score += 30;
    } else if (colorCount > 5) {
      score += 15;
    }
    
    // Bonus for text
    if (whiteCount > 1000) {
      score += 30;
    } else if (whiteCount > 500) {
      score += 15;
    }
    
    // Bonus for background
    if (blackCount > 10000 || blueCount > 1000) {
      score += 20;
    }
    
    console.log(`  Score: ${score}`);
    
    results.push({
      frame: targetFrame,
      pc: cpuState.pc,
      status,
      colorCount,
      whiteCount,
      blueCount,
      blackCount,
      score
    });
    
    if (score > bestScore) {
      bestScore = score;
      bestFrame = targetFrame;
      console.log(`  🎯 NEW BEST FRAME!`);
    }
    
  } catch (error) {
    console.log(`  ❌ Screenshot failed: ${(error as Error).message}`);
  }
}

console.log(`\n=== Results Summary ===`);
console.log(`Best frame: ${bestFrame} (score: ${bestScore})`);

console.log(`\nAll frames:`);
results
  .sort((a, b) => b.score - a.score)
  .forEach((result, i) => {
    console.log(`  ${i + 1}. Frame ${result.frame}: ${result.status} - ${result.colorCount} colors, ${result.whiteCount} white, score: ${result.score}`);
  });

console.log(`\n=== Recommendations ===`);
if (bestScore > 100) {
  console.log(`🎉 EXCELLENT: Frame ${bestFrame} looks like a great title screen!`);
  console.log(`   - Score: ${bestScore}`);
  console.log(`   - In game code: ${results.find(r => r.frame === bestFrame)?.status}`);
  console.log(`   - Colors: ${results.find(r => r.frame === bestFrame)?.colorCount}`);
  console.log(`   - White pixels: ${results.find(r => r.frame === bestFrame)?.whiteCount}`);
  console.log(`\n📸 Check: traces/sonic_frame_${bestFrame}_final.png`);
} else if (bestScore > 50) {
  console.log(`✅ GOOD: Frame ${bestFrame} is acceptable`);
} else {
  console.log(`⚠️ POOR: No good title screen found, might need to run longer`);
  console.log(`   Try frames 1000-1500 or check if Sonic needs different timing`);
}
