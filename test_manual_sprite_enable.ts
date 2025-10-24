import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing manual sprite enable for Spy vs Spy');

const run = async () => {
  // Load ROM and BIOS files
  const romData = readFileSync('./third_party/mame/roms/sms1/spyvsspy.sms');
  const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
  
  const machine = createMachine({
    cart: {
      rom: romData,
    },
    bus: {
      bios: biosData,
    },
  });

  // Run for 1300 frames (optimal title screen frame for Spy vs Spy)
  const cyclesPerFrame = 60000; // NTSC
  const totalCycles = 1300 * cyclesPerFrame;
  machine.runCycles(totalCycles);

  const vdp = machine.getVDP();
  const vdpState = vdp.getState();
  
  console.log(`\n=== Before Fix ===`);
  console.log(`R1: 0x${vdpState.regs[1].toString(16)}`);
  console.log(`Sprites enabled: ${vdpState.regs[1] & 0x02 ? '✅' : '❌'}`);
  
  // Manually enable sprites by setting bit 1 in R1
  const currentR1 = vdpState.regs[1];
  const fixedR1 = currentR1 | 0x02; // Set bit 1 to enable sprites
  
  console.log(`\n=== Manual Fix ===`);
  console.log(`Original R1: 0x${currentR1.toString(16)} (${currentR1.toString(2).padStart(8, '0')})`);
  console.log(`Fixed R1: 0x${fixedR1.toString(16)} (${fixedR1.toString(2).padStart(8, '0')})`);
  
  // Write the fixed R1 directly to the VDP state
  const vdpInternal = vdp as any;
  if (vdpInternal.s && vdpInternal.s.regs) {
    vdpInternal.s.regs[1] = fixedR1;
  } else {
    console.log('❌ Cannot access VDP internal state');
    return;
  }
  
  // Render a frame with sprites enabled
  vdp.renderFrame();
  
  // Generate screenshot
  const frameBuffer = vdp.getFrameBuffer();
  const width = 256;
  const height = 192;
  const png = new PNG({ width, height });

  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * 3;
    const dstIdx = i * 4;
    png.data[dstIdx] = frameBuffer[srcIdx] ?? 0;
    png.data[dstIdx + 1] = frameBuffer[srcIdx + 1] ?? 0;
    png.data[dstIdx + 2] = frameBuffer[srcIdx + 2] ?? 0;
    png.data[dstIdx + 3] = 255;
  }

  writeFileSync('traces/spy_vs_spy_manual_sprites.png', PNG.sync.write(png));
  console.log(`📸 Screenshot with manual sprite enable: traces/spy_vs_spy_manual_sprites.png`);
  
  // Check final R1 state
  const finalVdpState = vdp.getState();
  console.log(`\n=== After Fix ===`);
  console.log(`Final R1: 0x${finalVdpState.regs[1].toString(16)}`);
  console.log(`Sprites enabled: ${finalVdpState.regs[1] & 0x02 ? '✅' : '❌'}`);
  
  // Analyze the screenshot for sprites
  console.log(`\n=== Sprite Analysis ===`);
  const colorMap = new Map<string, number>();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3;
      const r = frameBuffer[idx] ?? 0;
      const g = frameBuffer[idx + 1] ?? 0;
      const b = frameBuffer[idx + 2] ?? 0;
      const colorKey = `${r},${g},${b}`;
      colorMap.set(colorKey, (colorMap.get(colorKey) ?? 0) + 1);
    }
  }
  
  console.log(`Total unique colors: ${colorMap.size}`);
  
  // Check for sprite-like colors (bright, distinct colors)
  const brightColors = Array.from(colorMap.entries())
    .filter(([colorKey, count]) => {
      const [r, g, b] = colorKey.split(',').map(Number);
      // Look for bright colors that might be sprites
      return (r > 200 || g > 200 || b > 200) && count < 1000; // Bright but not dominant
    })
    .sort((a, b) => b[1] - a[1]);
  
  if (brightColors.length > 0) {
    console.log(`\nPotential sprite colors:`);
    brightColors.slice(0, 5).forEach(([colorKey, count], i) => {
      const [r, g, b] = colorKey.split(',').map(Number);
      console.log(`  ${i + 1}. RGB(${r},${g},${b}): ${count} pixels`);
    });
  } else {
    console.log(`\nNo obvious sprite colors detected`);
  }
  
  // Check corners for consistency
  console.log(`\n=== Corner Analysis ===`);
  const corners = [
    { name: 'Top-Left', x: 0, y: 0 },
    { name: 'Top-Right', x: width - 4, y: 0 },
    { name: 'Bottom-Left', x: 0, y: height - 4 },
    { name: 'Bottom-Right', x: width - 4, y: height - 4 }
  ];
  
  corners.forEach(corner => {
    const idx = (corner.y * width + corner.x) * 3;
    const r = frameBuffer[idx] ?? 0;
    const g = frameBuffer[idx + 1] ?? 0;
    const b = frameBuffer[idx + 2] ?? 0;
    console.log(`  ${corner.name}: RGB(${r},${g},${b})`);
  });
};

run();
