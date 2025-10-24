import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'fs';

console.log('Debugging VRAM clearing issue for Spy vs Spy');

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

// Run to frame 700
for (let frame = 0; frame < 700; frame++) {
  machine.runCycles(228 * 262);
}

// Check VDP state
const vdpState = vdp.getState?.() ?? {};
const vram = vdpState.vram;
const regs = vdpState.regs ?? [];

console.log(`\n=== VDP State Analysis ===`);
console.log(`VRAM length: ${vram?.length ?? 'undefined'}`);

if (vram) {
  // Check VRAM contents
  let nonZeroBytes = 0;
  let zeroBytes = 0;
  
  for (let i = 0; i < vram.length; i++) {
    if (vram[i] !== 0) {
      nonZeroBytes++;
    } else {
      zeroBytes++;
    }
  }
  
  console.log(`VRAM contents:`);
  console.log(`  Non-zero bytes: ${nonZeroBytes}`);
  console.log(`  Zero bytes: ${zeroBytes}`);
  console.log(`  Non-zero percentage: ${(nonZeroBytes / vram.length * 100).toFixed(2)}%`);
  
  // Check specific VRAM regions
  const nameTableAddr = ((regs[2] ?? 0) << 10) & 0x3C00;
  const patternTableAddr = ((regs[4] ?? 0) << 11) & 0x3800;
  
  console.log(`\nVDP Table Addresses:`);
  console.log(`  Name Table: 0x${nameTableAddr.toString(16).padStart(4, '0')}`);
  console.log(`  Pattern Table: 0x${patternTableAddr.toString(16).padStart(4, '0')}`);
  
  // Check name table region
  const nameTableSize = 32 * 24; // 32x24 tiles
  const nameTableStart = nameTableAddr;
  const nameTableEnd = nameTableStart + nameTableSize;
  
  let nameTableNonZero = 0;
  for (let i = nameTableStart; i < nameTableEnd && i < vram.length; i++) {
    if (vram[i] !== 0) {
      nameTableNonZero++;
    }
  }
  
  console.log(`\nName Table Analysis:`);
  console.log(`  Address range: 0x${nameTableStart.toString(16).padStart(4, '0')} - 0x${nameTableEnd.toString(16).padStart(4, '0')}`);
  console.log(`  Non-zero entries: ${nameTableNonZero}/${nameTableSize}`);
  console.log(`  Non-zero percentage: ${(nameTableNonZero / nameTableSize * 100).toFixed(2)}%`);
  
  // Check pattern table region
  const patternTableSize = 256 * 8; // 256 patterns * 8 bytes each
  const patternTableStart = patternTableAddr;
  const patternTableEnd = patternTableStart + patternTableSize;
  
  let patternTableNonZero = 0;
  for (let i = patternTableStart; i < patternTableEnd && i < vram.length; i++) {
    if (vram[i] !== 0) {
      patternTableNonZero++;
    }
  }
  
  console.log(`\nPattern Table Analysis:`);
  console.log(`  Address range: 0x${patternTableStart.toString(16).padStart(4, '0')} - 0x${patternTableEnd.toString(16).padStart(4, '0')}`);
  console.log(`  Non-zero entries: ${patternTableNonZero}/${patternTableSize}`);
  console.log(`  Non-zero percentage: ${(patternTableNonZero / patternTableSize * 100).toFixed(2)}%`);
  
  // Check if the issue is that we're clearing VRAM but the game is still using the same addresses
  console.log(`\n=== Issue Analysis ===`);
  
  if (nameTableNonZero > 0) {
    console.log(`❌ Name table still has data - SEGA logo tiles are still referenced`);
  } else {
    console.log(`✅ Name table is clear`);
  }
  
  if (patternTableNonZero > 0) {
    console.log(`❌ Pattern table still has data - SEGA logo patterns are still there`);
  } else {
    console.log(`✅ Pattern table is clear`);
  }
  
  // Check if the issue is timing
  const cpuState = cpu.getState();
  console.log(`\nCPU State:`);
  console.log(`  PC: 0x${cpuState.pc.toString(16).padStart(4, '0')}`);
  
  if (cpuState.pc >= 0x4000) {
    console.log(`  Status: In game code`);
  } else {
    console.log(`  Status: Still in BIOS code`);
  }
  
  // Check if the issue is that Spy vs Spy is writing to VRAM after we clear it
  console.log(`\n=== Possible Issues ===`);
  console.log(`1. VRAM clearing happens too early (before game takes control)`);
  console.log(`2. Spy vs Spy writes to VRAM after we clear it`);
  console.log(`3. VDP registers point to wrong addresses`);
  console.log(`4. SEGA logo is rendered from a different source (not VRAM)`);
  
  // Check VDP registers
  console.log(`\nVDP Registers:`);
  for (let i = 0; i < 8; i++) {
    console.log(`  R${i}: 0x${(regs[i] ?? 0).toString(16).padStart(2, '0')}`);
  }
  
  // Check if we need to clear VRAM at a different time
  console.log(`\n=== Recommendations ===`);
  
  if (nameTableNonZero > 0 || patternTableNonZero > 0) {
    console.log(`💡 VRAM still contains data - try clearing it later or differently`);
  }
  
  if (cpuState.pc < 0x4000) {
    console.log(`💡 Still in BIOS code - VRAM clearing might be too early`);
  } else {
    console.log(`💡 In game code - VRAM clearing should work`);
  }
  
  // Check if the issue is that we need to clear VRAM differently
  console.log(`\n=== Alternative Approaches ===`);
  console.log(`1. Clear VRAM after game code starts executing`);
  console.log(`2. Change VDP table addresses to point to empty VRAM regions`);
  console.log(`3. Force VDP to use different pattern/name table addresses`);
  console.log(`4. Check if SEGA logo is rendered from CRAM or other source`);
  
} else {
  console.log(`❌ VRAM not accessible`);
}
