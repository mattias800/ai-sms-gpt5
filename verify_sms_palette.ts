import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'fs';

console.log('Verifying SMS palette accuracy for Spy vs Spy');

// Load BIOS
const biosPath = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
const biosData = readFileSync(biosPath);

// Test Spy vs Spy
const spyVsSpyPath = './spyvsspy.sms';
const spyVsSpyData = readFileSync(spyVsSpyPath);

const spyVsSpyCart = { rom: spyVsSpyData };
const machine = createMachine({ cart: spyVsSpyCart, useManualInit: false, bus: { bios: biosData } });
const vdp = machine.getVDP();

// Run to frame 1000 (title screen)
for (let frame = 0; frame < 1000; frame++) {
  machine.runCycles(228 * 262);
}

// Get VDP state
const vdpState = vdp.getState?.() ?? {};
const cram = vdpState.cram ?? [];
const regs = vdpState.regs ?? [];

console.log('VDP State Analysis:');
console.log(`  Display enabled: ${((regs[1] ?? 0) & 0x40) !== 0}`);
console.log(`  Background color (R7): 0x${(regs[7] ?? 0).toString(16).padStart(2, '0')}`);

console.log('\nCRAM (Color RAM) contents:');
for (let i = 0; i < 32; i++) {
  const cramValue = cram[i] ?? 0;
  const r = (cramValue & 0x03) * 85; // 2-bit to 8-bit conversion
  const g = ((cramValue >> 2) & 0x03) * 85;
  const b = ((cramValue >> 4) & 0x03) * 85;
  
  console.log(`  CRAM[${i.toString().padStart(2, ' ')}]: 0x${cramValue.toString(16).padStart(2, '0')} = RGB(${r},${g},${b})`);
}

// Check if our palette conversion is correct
console.log('\nSMS Palette Conversion Analysis:');
console.log('Expected SMS palette values:');
const expectedSMSColors = [
  { name: 'Black', sms: 0x00, rgb: [0, 0, 0] },
  { name: 'Dark Blue', sms: 0x11, rgb: [85, 85, 85] },
  { name: 'Blue', sms: 0x22, rgb: [170, 170, 170] },
  { name: 'Light Blue', sms: 0x33, rgb: [255, 255, 255] },
  { name: 'Dark Red', sms: 0x04, rgb: [85, 0, 0] },
  { name: 'Red', sms: 0x08, rgb: [170, 0, 0] },
  { name: 'Light Red', sms: 0x0C, rgb: [255, 0, 0] },
  { name: 'Dark Green', sms: 0x10, rgb: [0, 85, 0] },
  { name: 'Green', sms: 0x20, rgb: [0, 170, 0] },
  { name: 'Light Green', sms: 0x30, rgb: [0, 255, 0] },
  { name: 'Dark Yellow', sms: 0x14, rgb: [85, 85, 0] },
  { name: 'Yellow', sms: 0x28, rgb: [170, 170, 0] },
  { name: 'Light Yellow', sms: 0x3C, rgb: [255, 255, 0] },
  { name: 'Dark Cyan', sms: 0x15, rgb: [85, 85, 85] },
  { name: 'Cyan', sms: 0x2A, rgb: [170, 170, 170] },
  { name: 'Light Cyan', sms: 0x3F, rgb: [255, 255, 255] }
];

expectedSMSColors.forEach(color => {
  const found = cram.find(c => c === color.sms);
  if (found !== undefined) {
    const index = cram.indexOf(found);
    console.log(`  ✅ ${color.name}: Found at CRAM[${index}] = 0x${found.toString(16).padStart(2, '0')}`);
  } else {
    console.log(`  ❌ ${color.name}: Not found in CRAM`);
  }
});

// Check if our RGB conversion matches expected values
console.log('\nRGB Conversion Verification:');
const testColors = [
  { sms: 0x00, expected: [0, 0, 0], name: 'Black' },
  { sms: 0x33, expected: [255, 255, 255], name: 'White' },
  { sms: 0x3C, expected: [255, 255, 0], name: 'Yellow' }
];

testColors.forEach(test => {
  const r = (test.sms & 0x03) * 85;
  const g = ((test.sms >> 2) & 0x03) * 85;
  const b = ((test.sms >> 4) & 0x03) * 85;
  
  const matches = r === test.expected[0] && g === test.expected[1] && b === test.expected[2];
  console.log(`  ${matches ? '✅' : '❌'} ${test.name}: SMS 0x${test.sms.toString(16).padStart(2, '0')} → RGB(${r},${g},${b}) ${matches ? '✓' : '✗ Expected: RGB(' + test.expected.join(',') + ')'}`);
});

// Check VDP registers for accuracy
console.log('\nVDP Register Analysis:');
const registerNames = [
  'R0: Mode Control',
  'R1: Display Control', 
  'R2: Name Table Base',
  'R3: Color Table Base',
  'R4: Pattern Table Base',
  'R5: Sprite Attribute Table',
  'R6: Sprite Pattern Base',
  'R7: Background Color',
  'R8: Horizontal Scroll',
  'R9: Vertical Scroll',
  'R10: Color 0/1/2/3',
  'R11: Color 4/5/6/7',
  'R12: Color 8/9/10/11',
  'R13: Color 12/13/14/15'
];

registerNames.forEach((name, i) => {
  const value = regs[i] ?? 0;
  console.log(`  ${name}: 0x${value.toString(16).padStart(2, '0')}`);
});
