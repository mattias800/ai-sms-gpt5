import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Debugging R1 writes to understand sprite enable/disable');

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

  // Enable VDP control logging
  process.env.DEBUG_VDP_CTRL_LOG = '1';
  
  // Run for 1300 frames (optimal title screen frame for Spy vs Spy)
  const cyclesPerFrame = 60000; // NTSC
  const totalCycles = 1300 * cyclesPerFrame;
  machine.runCycles(totalCycles);

  const vdp = machine.getVDP();
  const vdpState = vdp.getState();
  const cpuState = machine.getCPU().getState();

  console.log(`\n=== Final VDP State ===`);
  console.log(`CPU PC: 0x${cpuState.pc.toString(16)}`);
  console.log(`R1 (Display Control): 0x${vdpState.regs[1].toString(16)}`);
  console.log(`  - Display enable: ${vdpState.regs[1] & 0x40 ? 'ON' : 'OFF'}`);
  console.log(`  - Sprite enable: ${vdpState.regs[1] & 0x02 ? 'ON' : 'OFF'}`);
  console.log(`  - Sprite size: ${vdpState.regs[1] & 0x01 ? '8x16' : '8x8'}`);
  
  // Check what R1 should be for sprites to be enabled
  console.log(`\n=== R1 Analysis ===`);
  const currentR1 = vdpState.regs[1];
  console.log(`Current R1: 0x${currentR1.toString(16)} (${currentR1.toString(2).padStart(8, '0')})`);
  
  // R1 bit meanings:
  // Bit 0: Sprite size (0=8x8, 1=8x16)
  // Bit 1: Sprite enable (0=disabled, 1=enabled)
  // Bit 6: Display enable (0=disabled, 1=enabled)
  
  const spriteSize = currentR1 & 0x01;
  const spriteEnable = currentR1 & 0x02;
  const displayEnable = currentR1 & 0x40;
  
  console.log(`Bit 0 (Sprite size): ${spriteSize ? '8x16' : '8x8'}`);
  console.log(`Bit 1 (Sprite enable): ${spriteEnable ? 'ENABLED' : 'DISABLED'} ❌`);
  console.log(`Bit 6 (Display enable): ${displayEnable ? 'ENABLED' : 'DISABLED'}`);
  
  // What R1 should be for sprites to work
  const expectedR1 = (currentR1 & ~0x02) | 0x02; // Set bit 1 to enable sprites
  console.log(`\nExpected R1 for sprites: 0x${expectedR1.toString(16)} (${expectedR1.toString(2).padStart(8, '0')})`);
  console.log(`Difference: 0x${(expectedR1 ^ currentR1).toString(16)}`);
  
  // Check if this is a Spy vs Spy specific issue
  console.log(`\n=== Spy vs Spy Analysis ===`);
  console.log(`Current R1: 0x${currentR1.toString(16)}`);
  
  // Check if R1=0xa0 was blocked (this would disable display AND sprites)
  if (currentR1 === 0xa0) {
    console.log(`❌ R1=0xa0 detected - this disables both display and sprites!`);
    console.log(`   This is likely being blocked by our corruption fix.`);
  } else if (currentR1 === 0x4d) {
    console.log(`✅ R1=0x4d detected - display enabled, sprites disabled`);
    console.log(`   This suggests sprites were intentionally disabled by the game.`);
  } else {
    console.log(`⚠️ Unexpected R1 value: 0x${currentR1.toString(16)}`);
  }
  
  // Check if we need to enable sprites manually
  console.log(`\n=== Sprite Fix Analysis ===`);
  if (!spriteEnable) {
    console.log(`❌ Sprites are disabled. Possible fixes:`);
    console.log(`   1. Check if R1=0xa0 writes are being blocked incorrectly`);
    console.log(`   2. Check if legitimate R1 writes are being corrupted`);
    console.log(`   3. Manually enable sprites in R1`);
    
    // Test what happens if we enable sprites
    console.log(`\nTesting sprite enable fix...`);
    
    // Create a new machine and manually set R1 to enable sprites
    const machine2 = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });
    
    // Run to the same point
    machine2.runCycles(totalCycles);
    
    // Manually enable sprites in R1
    const vdp2 = machine2.getVDP();
    const vdpState2 = vdp2.getState();
    const currentR1_2 = vdpState2.regs[1];
    const fixedR1 = currentR1_2 | 0x02; // Set bit 1 to enable sprites
    
    console.log(`Original R1: 0x${currentR1_2.toString(16)}`);
    console.log(`Fixed R1: 0x${fixedR1.toString(16)}`);
    
    // Write the fixed R1
    vdp2.writeControl(0x80 | 1); // Register 1
    vdp2.writeControl(fixedR1);   // Value
    
    // Render a frame with sprites enabled
    vdp2.renderFrame();
    
    // Generate screenshot
    const frameBuffer = vdp2.getFrameBuffer();
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

    writeFileSync('traces/spy_vs_spy_sprites_enabled.png', PNG.sync.write(png));
    console.log(`📸 Screenshot with sprites enabled: traces/spy_vs_spy_sprites_enabled.png`);
    
    // Check final R1 state
    const finalVdpState = vdp2.getState();
    console.log(`Final R1 after fix: 0x${finalVdpState.regs[1].toString(16)}`);
    console.log(`Sprites enabled: ${finalVdpState.regs[1] & 0x02 ? '✅' : '❌'}`);
  } else {
    console.log(`✅ Sprites are already enabled`);
  }
};

run();
