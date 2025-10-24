import { createMachine } from '../src/machine/machine.js';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Create a PNG file from RGB frame buffer
const createPNG = async (rgb: Uint8Array, width: number, height: number): Promise<Buffer> => {
  // Try to dynamically import pngjs
  let PNG: any;
  try {
    const pngjs = await import('pngjs');
    PNG = pngjs.PNG;
  } catch {
    console.log('Installing pngjs...');
    execSync('npm install pngjs', { stdio: 'inherit' });
    const pngjs = await import('pngjs');
    PNG = pngjs.PNG;
  }

  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 3;
      const dstIdx = (y * width + x) * 4;
      png.data[dstIdx] = rgb[srcIdx] ?? 0; // R
      png.data[dstIdx + 1] = rgb[srcIdx + 1]; // G
      png.data[dstIdx + 2] = rgb[srcIdx + 2]; // B
      png.data[dstIdx + 3] = 255; // A
    }
  }

  return PNG.sync.write(png);
};

const renderFrames = async () => {
  // Check for ROM path from command line argument or default location
  const romPath = process.argv[2] || 'roms/sonic.sms';

  if (!fs.existsSync(romPath)) {
    console.error(`ROM file not found: ${romPath}`);
    console.error('\nUsage: npx tsx tools/render_vdp_frames.ts <path-to-rom>');
    console.error('Example: npx tsx tools/render_vdp_frames.ts /path/to/sonic.sms');
    process.exit(1);
  }

  console.log(`Loading ROM: ${romPath}`);

  const romData = fs.readFileSync(romPath);
  const system = createMachine();
  system.loadROM(new Uint8Array(romData));

  // Create output directory
  const outputDir = 'output/vdp_frames';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Running emulation and capturing frames...');

  const framesToCapture = [
    { cycles: 1000000, name: 'frame_1M_cycles' },
    { cycles: 5000000, name: 'frame_5M_cycles' },
    { cycles: 10000000, name: 'frame_10M_cycles' },
    { cycles: 20000000, name: 'frame_20M_cycles' },
    { cycles: 50000000, name: 'frame_50M_cycles' },
  ];

  let totalCycles = 0;
  let captureIdx = 0;

  // Run emulation
  while (captureIdx < framesToCapture.length) {
    // Run for 1 frame worth of cycles
    const cyclesPerFrame = 59736; // ~228 cycles/line * 262 lines
    system.runCycles(cyclesPerFrame);
    totalCycles += cyclesPerFrame;

    // Check if we should capture a frame
    if (totalCycles >= framesToCapture[captureIdx].cycles) {
      const frame = framesToCapture[captureIdx];

      // Render frame
      const vdp = system.getState().vdp;
      if (!vdp.renderFrame) {
        console.error('VDP does not support frame rendering');
        break;
      }

      const frameBuffer = vdp.renderFrame();
      const png = await createPNG(frameBuffer, 256, 192);
      const outputPath = `${outputDir}/${frame.name}.png`;
      fs.writeFileSync(outputPath, png);
      console.log(`✓ Captured frame at ${frame.cycles} cycles: ${outputPath}`);

      // Also dump VDP state
      const state = system.getState();
      const vdpInfo = {
        cycles: totalCycles,
        vdp: {
          line: state.vdp.line,
          displayEnabled: state.vdp.displayEnabled,
          vramWrites: state.vdp.vramWrites,
          cramWrites: state.vdp.cramWrites,
          registers: state.vdp.regs.slice(0, 11),
          nameTableBase: state.vdp.nameTableBase.toString(16).padStart(4, '0'),
          spriteAttrBase: state.vdp.spriteAttrBase.toString(16).padStart(4, '0'),
          spritePatternBase: state.vdp.spritePatternBase.toString(16).padStart(4, '0'),
        },
        cpu: {
          pc: state.cpu.pc.toString(16).padStart(4, '0'),
          sp: state.cpu.sp.toString(16).padStart(4, '0'),
          totalCycles: state.cpu.totalCycles,
        },
      };

      const infoPath = `${outputDir}/${frame.name}.json`;
      fs.writeFileSync(infoPath, JSON.stringify(vdpInfo, null, 2));
      console.log(`  State saved to: ${infoPath}`);

      captureIdx++;
    }
  }

  console.log('\nFrame capture complete!');

  // Final diagnostics
  const finalState = system.getState();
  console.log('\nFinal state:');
  console.log(`  CPU cycles: ${finalState.cpu.totalCycles}`);
  console.log(`  VDP line: ${finalState.vdp.line}`);
  console.log(`  VRAM writes: ${finalState.vdp.vramWrites}`);
  console.log(`  CRAM writes: ${finalState.vdp.cramWrites}`);
};

// Run the main function
renderFrames().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
