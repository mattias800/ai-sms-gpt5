import { createMachine } from './src/machine/machine.js';
import { readFileSync, createWriteStream, mkdirSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging SEGA logo visibility in Spy vs Spy title screen');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Track CPU execution to see if we're in BIOS or game code
const cpu = machine.getCPU();

// Run to different frames and check what's happening
const testFrames = [300, 500, 700, 900, 1100, 1300];

for (const targetFrame of testFrames) {
  console.log(`\n=== Frame ${targetFrame} Analysis ===`);
  
  // Run to target frame
  for (let frame = 0; frame < targetFrame; frame++) {
    machine.runCycles(228 * 262);
  }
  
  // Check CPU state
  const cpuState = cpu.getState();
  const pc = cpuState.pc;
  const sp = cpuState.sp;
  
  console.log(`CPU State:`);
  console.log(`  PC: 0x${pc.toString(16).padStart(4, '0')}`);
  console.log(`  SP: 0x${sp.toString(16).padStart(4, '0')}`);
  
  // Check if we're in BIOS or game code
  if (pc < 0x4000) {
    console.log(`  Status: 🔴 Still in BIOS code (PC < 0x4000)`);
  } else if (pc >= 0x4000 && pc < 0x8000) {
    console.log(`  Status: 🟡 In game ROM code (0x4000-0x7FFF)`);
  } else if (pc >= 0x8000) {
    console.log(`  Status: 🟢 In game RAM/ROM code (0x8000+)`);
  }
  
  // Check VDP state
  const vdpState = vdp.getState?.() ?? {};
  const regs = vdpState.regs ?? [];
  const cram = vdpState.cram ?? [];
  
  console.log(`VDP State:`);
  console.log(`  Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
  console.log(`  Background color (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);
  
  // Check if we're in the right VDP mode
  const mode = (regs[0] ?? 0) & 0x0F;
  console.log(`  VDP Mode: ${mode} (should be 4 for SMS)`);
  
  // Check name table address
  const nameTableAddr = ((regs[2] ?? 0) << 10) & 0x3C00;
  console.log(`  Name Table Address: 0x${nameTableAddr.toString(16).padStart(4, '0')}`);
  
  // Check pattern table address
  const patternTableAddr = ((regs[4] ?? 0) << 11) & 0x3800;
  console.log(`  Pattern Table Address: 0x${patternTableAddr.toString(16).padStart(4, '0')}`);
  
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
    
    const filename = `traces/spy_vs_spy_frame_${targetFrame}_debug.png`;
    png.pack().pipe(createWriteStream(filename));
    console.log(`  📸 Generated: ${filename}`);
    
    // Analyze the screenshot for SEGA logo
    const segaLogoPixels = [];
    const whitePixels = [];
    
    for (let y = 0; y < 192; y++) {
      for (let x = 0; x < 256; x++) {
        const idx = (y * 256 + x) * 3;
        const r = frameBuffer[idx] ?? 0;
        const g = frameBuffer[idx + 1] ?? 0;
        const b = frameBuffer[idx + 2] ?? 0;
        
        // Check for white pixels (SEGA logo)
        if (r === 255 && g === 255 && b === 255) {
          whitePixels.push({ x, y });
          
          // Check if this is in the SEGA logo area (roughly center-top)
          if (x >= 80 && x <= 176 && y >= 40 && y <= 80) {
            segaLogoPixels.push({ x, y });
          }
        }
      }
    }
    
    console.log(`  White pixels: ${whitePixels.length}`);
    console.log(`  SEGA logo area pixels: ${segaLogoPixels.length}`);
    
    // Check if we're still in BIOS phase
    if (pc < 0x4000) {
      console.log(`  🔴 BIOS Phase: SEGA logo should be visible`);
    } else {
      console.log(`  🟢 Game Phase: SEGA logo should NOT be visible`);
      if (segaLogoPixels.length > 100) {
        console.log(`  ⚠️ WARNING: SEGA logo still visible in game phase!`);
      }
    }
    
  } catch (error) {
    console.log(`  ❌ Screenshot failed: ${(error as Error).message}`);
  }
}

// Check BIOS auto-disable timing
console.log(`\n=== BIOS Auto-Disable Analysis ===`);
const bus = machine.getBus();
const totalCycles = machine.getTotalCycles?.() ?? 0;
const biosEnabled = bus.getBiosEnabled?.() ?? true;

console.log(`Total cycles: ${totalCycles.toLocaleString()}`);
console.log(`BIOS enabled: ${biosEnabled ? '✅' : '❌'}`);

// Check if BIOS auto-disable happened
const biosAutoDisabled = (machine as any).biosAutoDisabled ?? false;
console.log(`BIOS auto-disabled: ${biosAutoDisabled ? '✅' : '❌'}`);

if (biosAutoDisabled) {
  console.log(`✅ BIOS was automatically disabled`);
} else {
  console.log(`❌ BIOS was NOT automatically disabled - this might be the issue!`);
  console.log(`💡 The BIOS should be disabled to allow game code to execute`);
}

// Check if we need to run longer
console.log(`\n=== Recommendations ===`);
if (totalCycles < 50000000) { // ~833 frames
  console.log(`💡 Try running longer - current cycles: ${totalCycles.toLocaleString()}`);
  console.log(`   Recommended: 60,000,000+ cycles (~1000+ frames)`);
} else {
  console.log(`✅ Sufficient cycles executed: ${totalCycles.toLocaleString()}`);
}

// Check if the issue is timing
console.log(`\n=== Timing Analysis ===`);
console.log(`Spy vs Spy should:`);
console.log(`1. Start in BIOS (PC < 0x4000) - SEGA logo visible`);
console.log(`2. BIOS auto-disables after ~600 frames`);
console.log(`3. Game code executes (PC >= 0x4000) - SEGA logo should disappear`);
console.log(`4. Game shows title screen with blue background`);

// Check current state
const currentPC = cpu.getState().pc;
if (currentPC < 0x4000) {
  console.log(`\n🔴 Current issue: Still in BIOS code (PC=0x${currentPC.toString(16).padStart(4, '0')})`);
  console.log(`💡 Solution: BIOS auto-disable threshold might be too high`);
} else {
  console.log(`\n🟢 Current state: In game code (PC=0x${currentPC.toString(16).padStart(4, '0')})`);
  console.log(`💡 Issue: SEGA logo still visible despite being in game code`);
  console.log(`   This suggests a VDP rendering issue`);
}
