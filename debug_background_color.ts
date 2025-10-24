import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'fs';

console.log('Debugging Spy vs Spy background color issue');

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

// Get VDP state
const vdpState = vdp.getState?.() ?? {};
const regs = vdpState.regs ?? [];
const cram = vdpState.cram ?? [];

console.log('VDP State Analysis:');
console.log(`  Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0 ? '✅' : '❌'}`);
console.log(`  Background color register (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

// Check CRAM entries
console.log('\nCRAM Analysis:');
for (let i = 0; i < 16; i++) {
  const cramValue = cram[i] ?? 0;
  const r = ((cramValue & 0x03) * 85) & 0xff;
  const g = (((cramValue >> 2) & 0x03) * 85) & 0xff;
  const b = (((cramValue >> 4) & 0x03) * 85) & 0xff;
  
  console.log(`  CRAM[${i.toString().padStart(2, ' ')}]: 0x${cramValue.toString(16).padStart(2, '0')} → RGB(${r},${g},${b})`);
}

// Check what background color index R7 points to
const r7 = regs[7] ?? 0;
const bgColorIndex = r7 & 0x0F; // Lower 4 bits
const bgCramValue = cram[bgColorIndex] ?? 0;
const bgR = ((bgCramValue & 0x03) * 85) & 0xff;
const bgG = (((bgCramValue >> 2) & 0x03) * 85) & 0xff;
const bgB = (((bgCramValue >> 4) & 0x03) * 85) & 0xff;

console.log(`\nBackground Color Analysis:`);
console.log(`  R7 = 0x${r7.toString(16).padStart(2, '0')} → Background color index: ${bgColorIndex}`);
console.log(`  CRAM[${bgColorIndex}] = 0x${bgCramValue.toString(16).padStart(2, '0')} → RGB(${bgR},${bgG},${bgB})`);

// Check if this is the expected blue color
const expectedBlue = bgR === 0 && bgG === 85 && bgB === 255;
console.log(`  Expected blue RGB(0,85,255): ${expectedBlue ? '✅' : '❌'}`);

// Check what color index 0 is (used for transparent/background areas)
const color0CramValue = cram[0] ?? 0;
const color0R = ((color0CramValue & 0x03) * 85) & 0xff;
const color0G = (((color0CramValue >> 2) & 0x03) * 85) & 0xff;
const color0B = (((color0CramValue >> 4) & 0x03) * 85) & 0xff;

console.log(`\nColor 0 Analysis (used for transparent areas):`);
console.log(`  CRAM[0] = 0x${color0CramValue.toString(16).padStart(2, '0')} → RGB(${color0R},${color0G},${color0B})`);

// Check if color 0 is blue
const color0IsBlue = color0R === 0 && color0G === 85 && color0B === 255;
console.log(`  Color 0 is blue: ${color0IsBlue ? '✅' : '❌'}`);

// Check VDP registers that might affect background rendering
console.log(`\nVDP Register Analysis:`);
console.log(`  R0 (Mode): 0x${(regs[0] ?? 0).toString(16).padStart(2, '0')}`);
console.log(`  R1 (Display): 0x${(regs[1] ?? 0).toString(16).padStart(2, '0')}`);
console.log(`  R2 (Name Table): 0x${(regs[2] ?? 0).toString(16).padStart(2, '0')}`);
console.log(`  R3 (Color Table): 0x${(regs[3] ?? 0).toString(16).padStart(2, '0')}`);
console.log(`  R4 (Pattern Table): 0x${(regs[4] ?? 0).toString(16).padStart(2, '0')}`);
console.log(`  R7 (Background): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

// Check if there's a mismatch between what should be blue
console.log(`\nBackground Color Issue Analysis:`);
if (expectedBlue) {
  console.log(`  ✅ R7 points to correct blue color`);
} else {
  console.log(`  ❌ R7 points to wrong color: RGB(${bgR},${bgG},${bgB})`);
}

if (color0IsBlue) {
  console.log(`  ✅ Color 0 is blue`);
} else {
  console.log(`  ❌ Color 0 is not blue: RGB(${color0R},${color0G},${color0B})`);
}

// Check if the issue is that R7 should point to a different CRAM entry
console.log(`\nLooking for blue color in CRAM:`);
let blueFound = false;
for (let i = 0; i < 16; i++) {
  const cramValue = cram[i] ?? 0;
  const r = ((cramValue & 0x03) * 85) & 0xff;
  const g = (((cramValue >> 2) & 0x03) * 85) & 0xff;
  const b = (((cramValue >> 4) & 0x03) * 85) & 0xff;
  
  if (r === 0 && g === 85 && b === 255) {
    console.log(`  ✅ Found blue at CRAM[${i}]: RGB(${r},${g},${b})`);
    blueFound = true;
    
    if (i !== bgColorIndex) {
      console.log(`  ⚠️ Blue is at CRAM[${i}] but R7 points to CRAM[${bgColorIndex}]`);
      console.log(`  💡 Fix: Set R7 to 0x${(0x80 | i).toString(16).padStart(2, '0')} to point to blue`);
    }
  }
}

if (!blueFound) {
  console.log(`  ❌ No blue color found in CRAM`);
}

// Check if the issue is in our VDP rendering
console.log(`\nVDP Rendering Analysis:`);
console.log(`  The issue might be:`);
console.log(`  1. R7 points to wrong CRAM entry`);
console.log(`  2. CRAM doesn't contain blue color`);
console.log(`  3. VDP rendering logic issue`);
console.log(`  4. Background color not being applied correctly`);

// Check what the actual rendered background color should be
const frameBuffer = vdp.renderFrame();
if (frameBuffer) {
  // Sample some background pixels (corners)
  const corners = [
    { name: 'top-left', x: 0, y: 0 },
    { name: 'top-right', x: 255, y: 0 },
    { name: 'bottom-left', x: 0, y: 191 },
    { name: 'bottom-right', x: 255, y: 191 }
  ];
  
  console.log(`\nActual Rendered Colors (corners):`);
  corners.forEach(corner => {
    const idx = (corner.y * 256 + corner.x) * 3;
    const r = frameBuffer[idx] ?? 0;
    const g = frameBuffer[idx + 1] ?? 0;
    const b = frameBuffer[idx + 2] ?? 0;
    
    console.log(`  ${corner.name}: RGB(${r},${g},${b})`);
  });
}
