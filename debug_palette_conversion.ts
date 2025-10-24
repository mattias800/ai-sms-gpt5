import { createMachine } from './src/machine/machine.js';
import { readFileSync } from 'fs';

console.log('Debugging SMS palette conversion');

// Test the palette conversion function directly
const testPaletteConversion = (smsValue: number): {r: number, g: number, b: number} => {
  // SMS palette: 00BBGGRR (2 bits per component)
  const r = ((smsValue & 0x03) * 85) & 0xff; // 0,85,170,255
  const g = (((smsValue >> 2) & 0x03) * 85) & 0xff;
  const b = (((smsValue >> 4) & 0x03) * 85) & 0xff;
  return { r, g, b };
};

console.log('SMS Palette Conversion Test:');
console.log('Format: 00BBGGRR (2 bits per component)');

const testColors = [
  { sms: 0x00, name: 'Black', expected: { r: 0, g: 0, b: 0 } },
  { sms: 0x33, name: 'White', expected: { r: 255, g: 255, b: 255 } },
  { sms: 0x3C, name: 'Yellow', expected: { r: 255, g: 255, b: 0 } },
  { sms: 0x34, name: 'Blue', expected: { r: 0, g: 85, b: 255 } }
];

testColors.forEach(test => {
  const result = testPaletteConversion(test.sms);
  const matches = result.r === test.expected.r && result.g === test.expected.g && result.b === test.expected.b;
  
  console.log(`\n${test.name} (SMS 0x${test.sms.toString(16).padStart(2, '0')}):`);
  console.log(`  Binary: ${test.sms.toString(2).padStart(8, '0')}`);
  console.log(`  RR: ${test.sms & 0x03} → R: ${result.r}`);
  console.log(`  GG: ${(test.sms >> 2) & 0x03} → G: ${result.g}`);
  console.log(`  BB: ${(test.sms >> 4) & 0x03} → B: ${result.b}`);
  console.log(`  Result: RGB(${result.r},${result.g},${result.b})`);
  console.log(`  Expected: RGB(${test.expected.r},${test.expected.g},${test.expected.b})`);
  console.log(`  ${matches ? '✅ CORRECT' : '❌ WRONG'}`);
});

// Test with actual Spy vs Spy CRAM values
console.log('\n=== Spy vs Spy CRAM Analysis ===');

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

const vdpState = vdp.getState?.() ?? {};
const cram = vdpState.cram ?? [];

console.log('Spy vs Spy CRAM values and their RGB conversions:');
for (let i = 0; i < 16; i++) {
  const cramValue = cram[i] ?? 0;
  const rgb = testPaletteConversion(cramValue);
  console.log(`  CRAM[${i.toString().padStart(2, ' ')}]: 0x${cramValue.toString(16).padStart(2, '0')} → RGB(${rgb.r},${rgb.g},${rgb.b})`);
}

// Check if we have the colors we expect
const expectedColors = [
  { name: 'Background Blue', rgb: { r: 0, g: 85, b: 255 } },
  { name: 'Text White', rgb: { r: 255, g: 255, b: 255 } },
  { name: 'Accent Yellow', rgb: { r: 255, g: 255, b: 0 } }
];

console.log('\nExpected color analysis:');
expectedColors.forEach(expected => {
  const found = cram.find((value, index) => {
    const rgb = testPaletteConversion(value);
    return rgb.r === expected.rgb.r && rgb.g === expected.rgb.g && rgb.b === expected.rgb.b;
  });
  
  if (found !== undefined) {
    const index = cram.indexOf(found);
    console.log(`  ✅ ${expected.name}: Found at CRAM[${index}] = 0x${found.toString(16).padStart(2, '0')}`);
  } else {
    console.log(`  ❌ ${expected.name}: Not found in CRAM`);
  }
});
