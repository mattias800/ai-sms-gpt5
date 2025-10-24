import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing Sonic sprite rendering');

const run = async () => {
  try {
    // Load ROM and BIOS files
    const romData = readFileSync('./sonic.sms');
    const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
    
    console.log(`Sonic ROM size: ${romData.length} bytes`);
    console.log(`BIOS size: ${biosData.length} bytes`);
    
    const machine = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });

    // Run for 1000 frames (optimal title screen frame for Sonic)
    const cyclesPerFrame = 60000; // NTSC
    const totalCycles = 1000 * cyclesPerFrame;
    machine.runCycles(totalCycles);

    const vdp = machine.getVDP();
    const vdpState = vdp.getState();
    const cpuState = machine.getCPU().getState();
    
    console.log(`\n=== Sonic Frame 1000 VDP State ===`);
    console.log(`CPU PC: 0x${cpuState.pc.toString(16)}`);
    console.log(`R1 (Display Control): 0x${vdpState.regs[1].toString(16)}`);
    console.log(`  - Display enable: ${vdpState.regs[1] & 0x40 ? 'ON' : 'OFF'}`);
    console.log(`  - Sprite enable: ${vdpState.regs[1] & 0x02 ? 'ON' : 'OFF'}`);
    console.log(`  - Sprite size: ${vdpState.regs[1] & 0x01 ? '8x16' : '8x8'}`);
    
    // Generate screenshot
    const frameBuffer = vdp.renderFrame?.() ?? new Uint8Array(256 * 192 * 3);
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

    writeFileSync('traces/sonic_sprites_test.png', PNG.sync.write(png));
    console.log(`📸 Sonic screenshot: traces/sonic_sprites_test.png`);
    
    // Analyze for sprites
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
    
    console.log(`\n=== Sonic Sprite Analysis ===`);
    console.log(`Total unique colors: ${colorMap.size}`);
    
    // Check for Sonic's signature colors
    const sonicColors = [
      { name: 'Sonic Blue', rgb: '0,85,255' },
      { name: 'Sonic Red', rgb: '255,0,0' },
      { name: 'White', rgb: '255,255,255' },
      { name: 'Black', rgb: '0,0,0' },
      { name: 'Yellow', rgb: '255,255,0' }
    ];
    
    sonicColors.forEach(color => {
      const count = colorMap.get(color.rgb) ?? 0;
      const percentage = (count / (width * height) * 100).toFixed(2);
      if (count > 0) {
        console.log(`  ${color.name} RGB(${color.rgb}): ${count.toLocaleString()} pixels (${percentage}%)`);
      }
    });
    
    // Check if sprites are enabled
    if (vdpState.regs[1] & 0x02) {
      console.log(`✅ Sprites are enabled in Sonic!`);
    } else {
      console.log(`❌ Sprites are disabled in Sonic too!`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
