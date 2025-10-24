import { createMachine } from './src/machine/machine';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';

console.log('Testing Sonic sprite palette across extended frames');

const run = async () => {
  try {
    // Load ROM and BIOS files
    const romData = readFileSync('./sonic.sms');
    const biosData = readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom');
    
    const machine = createMachine({
      cart: {
        rom: romData,
      },
      bus: {
        bios: biosData,
      },
    });

    // Test multiple frames to see when sprite palette gets set
    const framesToTest = [500, 1000, 1500, 2000, 2500, 3000];
    
    for (const frame of framesToTest) {
      console.log(`\n=== Frame ${frame} ===`);
      
      // Run to the specified frame
      const cyclesPerFrame = 60000; // NTSC
      const totalCycles = frame * cyclesPerFrame;
      machine.runCycles(totalCycles);

      const vdp = machine.getVDP();
      const vdpState = vdp.getState();
      const cpuState = machine.getCPU().getState();
      
      console.log(`CPU PC: 0x${cpuState.pc.toString(16)}`);
      console.log(`R1 (Display Control): 0x${vdpState.regs[1].toString(16)}`);
      console.log(`  - Sprite enable: ${vdpState.regs[1] & 0x02 ? 'ON' : 'OFF'}`);
      
      // Check sprite palette
      const cram = vdp.getCRAM?.();
      if (!cram) {
        console.log(`❌ CRAM not accessible`);
        continue;
      }
      
      let spriteColorsSet = 0;
      for (let i = 16; i < 32; i++) {
        const cramIdx = i * 2;
        if (cramIdx + 1 < cram.length) {
          const low = cram[cramIdx] ?? 0;
          const high = cram[cramIdx + 1] ?? 0;
          const color = (high << 8) | low;
          if (color !== 0) spriteColorsSet++;
        }
      }
      
      console.log(`Sprite colors set: ${spriteColorsSet}/16`);
      
      if (spriteColorsSet > 0) {
        console.log(`✅ Sprite palette populated at frame ${frame}!`);
        
        // Show the sprite colors
        for (let i = 16; i < 32; i++) {
          const cramIdx = i * 2;
          if (cramIdx + 1 < cram.length) {
            const low = cram[cramIdx] ?? 0;
            const high = cram[cramIdx + 1] ?? 0;
            const color = (high << 8) | low;
            if (color !== 0) {
              const r = (color & 0x03) << 6;
              const g = ((color >> 2) & 0x03) << 6;
              const b = ((color >> 4) & 0x03) << 6;
              console.log(`  Color ${i}: 0x${color.toString(16).padStart(4, '0')} -> RGB(${r},${g},${b})`);
            }
          }
        }
        
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

        writeFileSync(`traces/sonic_frame_${frame}_with_sprites.png`, PNG.sync.write(png));
        console.log(`📸 Screenshot: traces/sonic_frame_${frame}_with_sprites.png`);
        break; // Found sprite palette, stop testing
      }
    }
    
    console.log(`\n=== Summary ===`);
    console.log(`Tested frames: ${framesToTest.join(', ')}`);
    console.log(`If no sprite palette was found, Sonic might not use sprites on the title screen.`);
    
  } catch (error) {
    console.log(`❌ Error: ${(error as Error).message}`);
  }
};

run();
