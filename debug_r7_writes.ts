import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'fs';

console.log('Debugging R7 (background color) writes in Spy vs Spy');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Track R7 writes
const r7History: Array<{frame: number, pc: number, oldValue: number, newValue: number}> = [];

// Hook into VDP writes to track R7 changes
const originalWritePort = vdp.writePort.bind(vdp);

vdp.writePort = (port: number, value: number): void => {
  const pc = machine.getCPU().getState().pc;
  const frame = Math.floor(machine.getTotalCycles?.() ?? 0 / (228 * 262));
  
  // Track R7 changes
  if (port === 0xBF) {
    const vdpStateBefore = vdp.getState?.() ?? {};
    const r7Before = vdpStateBefore.regs?.[7] ?? 0;
    
    originalWritePort(port, value);
    
    const vdpStateAfter = vdp.getState?.() ?? {};
    const r7After = vdpStateAfter.regs?.[7] ?? 0;
    
    if (r7Before !== r7After) {
      r7History.push({
        frame,
        pc,
        oldValue: r7Before,
        newValue: r7After
      });
      
      console.log(`Frame ${frame}: PC=0x${pc.toString(16).padStart(4, '0')} R7: 0x${r7Before.toString(16).padStart(2, '0')} → 0x${r7After.toString(16).padStart(2, '0')}`);
    }
  } else {
    originalWritePort(port, value);
  }
};

// Run to frame 700
console.log('Running to frame 700, tracking R7 changes...');
for (let frame = 0; frame < 700; frame++) {
  machine.runCycles(228 * 262);
}

console.log(`\n=== R7 Write Analysis ===`);
console.log(`Total R7 writes: ${r7History.length}`);

if (r7History.length > 0) {
  console.log('\nR7 write sequence:');
  r7History.forEach((write, i) => {
    console.log(`  ${(i+1).toString().padStart(2, ' ')}: Frame ${write.frame} PC=0x${write.pc.toString(16).padStart(4, '0')} 0x${write.oldValue.toString(16).padStart(2, '0')} → 0x${write.newValue.toString(16).padStart(2, '0')}`);
  });
  
  // Check if any write sets R7 to 0x00 (blue)
  const blueWrites = r7History.filter(w => w.newValue === 0x00);
  if (blueWrites.length > 0) {
    console.log(`\n✅ Found ${blueWrites.length} writes that set R7 to 0x00 (blue)`);
    blueWrites.forEach(write => {
      console.log(`  Frame ${write.frame}: PC=0x${write.pc.toString(16).padStart(4, '0')}`);
    });
  } else {
    console.log(`\n❌ No writes found that set R7 to 0x00 (blue)`);
  }
  
  // Check the final R7 value
  const finalR7 = r7History[r7History.length - 1]?.newValue ?? 0;
  console.log(`\nFinal R7 value: 0x${finalR7.toString(16).padStart(2, '0')}`);
  
  if (finalR7 === 0x00) {
    console.log(`✅ Final R7 points to blue (CRAM[0])`);
  } else {
    console.log(`❌ Final R7 points to CRAM[${finalR7}] (not blue)`);
  }
} else {
  console.log('❌ No R7 writes detected');
}

// Check current state
const vdpState = vdp.getState?.() ?? {};
const currentR7 = vdpState.regs?.[7] ?? 0;
const cram = vdpState.cram ?? [];
const currentBgColor = cram[currentR7] ?? 0;

console.log(`\n=== Current State ===`);
console.log(`Current R7: 0x${currentR7.toString(16).padStart(2, '0')}`);
console.log(`Current background color: CRAM[${currentR7}] = 0x${currentBgColor.toString(16).padStart(2, '0')}`);

const r = ((currentBgColor & 0x03) * 85) & 0xff;
const g = (((currentBgColor >> 2) & 0x03) * 85) & 0xff;
const b = (((currentBgColor >> 4) & 0x03) * 85) & 0xff;

console.log(`Current background RGB: RGB(${r},${g},${b})`);

// Check if we need to fix R7
if (currentR7 !== 0x00) {
  console.log(`\n=== Fix Analysis ===`);
  console.log(`❌ R7 should be 0x00 to point to blue background`);
  console.log(`💡 Spy vs Spy is setting R7 to 0x${currentR7.toString(16).padStart(2, '0')} instead of 0x00`);
  
  // Check if this is a Spy vs Spy specific issue
  console.log(`\nPossible causes:`);
  console.log(`1. Spy vs Spy expects gray background`);
  console.log(`2. Spy vs Spy has a bug and sets wrong R7`);
  console.log(`3. Our emulator has a timing issue`);
  console.log(`4. Spy vs Spy sets R7 correctly but we're reading it wrong`);
  
  // Check if we should fix this
  console.log(`\n=== Fix Recommendation ===`);
  console.log(`Since the user expects blue background, we should:`);
  console.log(`1. Set R7 to 0x00 to point to CRAM[0] (blue)`);
  console.log(`2. Or ensure CRAM[${currentR7}] contains blue color`);
  
  // Check what CRAM[0] contains
  const cram0 = cram[0] ?? 0;
  const cram0R = ((cram0 & 0x03) * 85) & 0xff;
  const cram0G = (((cram0 >> 2) & 0x03) * 85) & 0xff;
  const cram0B = (((cram0 >> 4) & 0x03) * 85) & 0xff;
  
  console.log(`CRAM[0] = 0x${cram0.toString(16).padStart(2, '0')} → RGB(${cram0R},${cram0G},${cram0B})`);
  
  if (cram0R === 0 && cram0G === 85 && cram0B === 255) {
    console.log(`✅ CRAM[0] contains blue - we should set R7 to 0x00`);
  } else {
    console.log(`❌ CRAM[0] doesn't contain blue - we need to fix CRAM or R7`);
  }
}
