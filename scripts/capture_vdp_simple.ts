import * as fs from 'fs';
import * as path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { VdpPublicState } from '../src/vdp/vdp.js';
import { fnv1a32 } from '../src/util/checksum.js';

interface VdpFrameSnapshot {
  frameNumber: number;
  vramChecksum: string;
  cramChecksum: string;
  displayEnabled: boolean;
  borderColor: number;
  spritesActive: number;
}

interface VdpTraceOutput {
  metadata: {
    rom: string;
    frames: number;
    timestamp: string;
  };
  frames: VdpFrameSnapshot[];
}

const captureVdpTrace = async (romPath: string, numFrames: number): Promise<VdpTraceOutput> => {
  if (!fs.existsSync(romPath)) {
    throw new Error(`ROM not found: ${romPath}`);
  }

  const romBuffer = fs.readFileSync(romPath);
  const machine = createMachine({
    cart: { rom: romBuffer }
  });

  const vdp = machine.getVDP();
  const vdpTrace: VdpFrameSnapshot[] = [];

  // Run approximately the specified number of frames
  // Each frame is ~60,000 cycles at NTSC timing
  const cyclesPerFrame = 60000;
  const totalCycles = numFrames * cyclesPerFrame;

  for (let frameNum = 0; frameNum < numFrames; frameNum++) {
    // Execute one frame worth of cycles
    machine.runCycles(cyclesPerFrame);

    // Get VDP state
    const state = vdp.getState() as VdpPublicState;

    // Get VRAM and CRAM data
    const vram = vdp.getVRAM?.() ?? new Uint8Array(0x4000);
    const cram = vdp.getCRAM?.() ?? new Uint8Array(0x20);

    // Calculate checksums
    const vramChecksum = fnv1a32(vram).toString(16).padStart(8, '0');
    const cramChecksum = fnv1a32(cram).toString(16).padStart(8, '0');

    const snapshot: VdpFrameSnapshot = {
      frameNumber: frameNum,
      vramChecksum,
      cramChecksum,
      displayEnabled: state.displayEnabled,
      borderColor: state.borderColor,
      spritesActive: state.spriteDebug?.length ?? 0
    };

    vdpTrace.push(snapshot);

    if ((frameNum + 1) % 10 === 0) {
      process.stdout.write(`.`);
    }
  }

  console.log();

  const romName = path.basename(romPath, path.extname(romPath));
  return {
    metadata: {
      rom: romName,
      frames: numFrames,
      timestamp: new Date().toISOString()
    },
    frames: vdpTrace
  };
};

const main = async (): Promise<void> => {
  const gameRomMap: Record<string, string> = {
    wonderboy: '/Users/mattias800/temp/ai-sms-gpt5/wonderboy5.sms',
    alexkidd: '/Users/mattias800/temp/ai-sms-gpt5/Alex Kidd - The Lost Stars (UE) [!].sms',
    sonic: '/Users/mattias800/temp/ai-sms-gpt5/sonic.sms',
  };

  const outputDir = '/Users/mattias800/temp/ai-sms-gpt5/artifacts';

  console.log('🎮 VDP Trace Capture - Graphics Validation\n');

  for (const [game, romFile] of Object.entries(gameRomMap)) {
    if (!fs.existsSync(romFile)) {
      console.warn(`⚠️  ROM not found: ${romFile}`);
      continue;
    }

    console.log(`📊 ${game.toUpperCase()}: `, {flush: true});

    try {
      const trace = await captureVdpTrace(romFile, 50);
      const outputPath = path.join(outputDir, `${game}_vdp_trace.json`);

      fs.writeFileSync(outputPath, JSON.stringify(trace, null, 2));

      // Print summary
      if (trace.frames.length > 0) {
        const firstFrame = trace.frames[0];
        const lastFrame = trace.frames[trace.frames.length - 1];

        console.log(`✅ Complete`);
        console.log(`   Frames: ${trace.frames.length}`);
        console.log(`   VRAM checksums: ${firstFrame.vramChecksum} → ${lastFrame.vramChecksum}`);
        console.log(`   Display: ${firstFrame.displayEnabled ? 'ON' : 'OFF'}`);
        console.log(`   Sprites: ${lastFrame.spritesActive} active`);
        console.log(`   Output: ${outputPath}\n`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  console.log('✅ VDP trace capture complete');
};

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
