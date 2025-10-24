import * as fs from 'fs';
import * as path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { VdpPublicState } from '../src/vdp/vdp.js';
import { fnv1a32 } from '../src/util/checksum.js';

interface VdpFrameSnapshot {
  frameNumber: number;
  lines: number;
  vramChecksum: string;
  cramChecksum: string;
  registers: number[];
  status: number;
  vblankIrqEnabled: boolean;
  displayEnabled: boolean;
  borderColor: number;
  hScroll: number;
  vScroll: number;
  spriteCount: number;
  spriteDebug?: Array<{
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    drawnPixels: number;
  }>;
}

interface VdpTraceOutput {
  metadata: {
    rom: string;
    emulator: string;
    timestamp: string;
    frames: number;
  };
  frames: VdpFrameSnapshot[];
}

const captureVdpTrace = async (romPath: string, frames: number): Promise<VdpTraceOutput> => {
  if (!fs.existsSync(romPath)) {
    throw new Error(`ROM not found: ${romPath}`);
  }

  const romBuffer = fs.readFileSync(romPath);
  const machine = createMachine({ cart: { rom: new Uint8Array(romBuffer) } });

  const vdpTrace: VdpFrameSnapshot[] = [];

  // Run the specified number of frames (approximately 60,000 cycles per frame for NTSC)
  for (let frameNum = 0; frameNum < frames; frameNum++) {
    // Step the machine one frame
    machine.runCycles(60000);

    // Get VDP state if available
    const vdp = machine.getVDP?.();
    if (vdp && vdp.getState) {
      const state = vdp.getState() as VdpPublicState;

      // Get VRAM and CRAM data
      const vram = vdp.getVRAM?.() ?? new Uint8Array(0x4000);
      const cram = vdp.getCRAM?.() ?? new Uint8Array(0x20);

      // Calculate checksums
      const vramChecksum = fnv1a32(vram).toString(16).padStart(8, '0');
      const cramChecksum = fnv1a32(cram).toString(16).padStart(8, '0');

      const snapshot: VdpFrameSnapshot = {
        frameNumber: frameNum,
        lines: state.line,
        vramChecksum,
        cramChecksum,
        registers: state.regs,
        status: state.status,
        vblankIrqEnabled: state.vblankIrqEnabled,
        displayEnabled: state.displayEnabled,
        borderColor: state.borderColor,
        hScroll: state.hScroll,
        vScroll: state.vScroll,
        spriteCount: state.spriteDebug?.length ?? 0,
        spriteDebug: (state.spriteDebug ?? [])
          .slice(0, 8)
          .map((s) => ({
            index: s.index,
            x: s.x,
            y: s.y,
            width: s.width,
            height: s.height,
            drawnPixels: s.drawnPixels
          }))
      };

      vdpTrace.push(snapshot);
    }
  }

  const romName = path.basename(romPath, path.extname(romPath));
  return {
    metadata: {
      rom: romName,
      emulator: 'ai-sms-gpt5',
      timestamp: new Date().toISOString(),
      frames
    },
    frames: vdpTrace
  };
};

const main = async (): Promise<void> => {
  // Map game names to actual ROM file paths
  const gameRomMap: Record<string, string> = {
    wonderboy: '/Users/mattias800/temp/ai-sms-gpt5/wonderboy5.sms',
    alexkidd: '/Users/mattias800/temp/ai-sms-gpt5/Alex Kidd - The Lost Stars (UE) [!].sms',
    sonic: '/Users/mattias800/temp/ai-sms-gpt5/sonic.sms',
  };
  const games = Object.keys(gameRomMap);
  const outputDir = '/Users/mattias800/temp/ai-sms-gpt5/artifacts';

  for (const game of games) {
    const romFile = gameRomMap[game];

    if (!romFile) {
      console.warn(`⚠️  ROM not found for ${game}`);
      continue;
    }

    console.log(`🎮 Capturing VDP trace for ${game} from ${romFile}`);

    try {
      const trace = await captureVdpTrace(romFile, 50);
      const outputPath = path.join(outputDir, `${game}_vdp_trace.json`);

      fs.writeFileSync(outputPath, JSON.stringify(trace, null, 2));
      console.log(`✅ VDP trace captured: ${outputPath}`);

      // Print summary
      if (trace.frames.length > 0) {
        const firstFrame = trace.frames[0];
        const lastFrame = trace.frames[trace.frames.length - 1];

        console.log(`   Frames: ${trace.frames.length}`);
        console.log(`   First VRAM Checksum: ${firstFrame.vramChecksum}`);
        console.log(`   Last VRAM Checksum: ${lastFrame.vramChecksum}`);
        console.log(`   Display Enabled: ${firstFrame.displayEnabled}`);
        console.log(`   Border Color: ${firstFrame.borderColor}`);
      }
    } catch (error) {
      console.error(`❌ Error capturing VDP trace for ${game}:`, error instanceof Error ? error.message : String(error));
    }
  }

  console.log('\n✅ VDP trace capture complete');
};

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
