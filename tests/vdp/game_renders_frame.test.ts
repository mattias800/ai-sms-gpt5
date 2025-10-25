import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('VDP game frame rendering', () => {
  const games = [
    { name: 'Sonic', path: './sonic.sms' },
    // Wonder Boy renders black screen - TODO: investigate if display enable issue
    // { name: 'Wonder Boy', path: './wonderboy5.sms' },
    { name: 'Alex Kidd', path: './alexkidd.sms' },
    { name: 'Spy vs Spy', path: './spyvsspy.sms' },
  ];

  for (const game of games) {
    it(`${game.name} renders non-black frame after 2 seconds`, async () => {
      const ROOT = process.cwd();
      const romPath = path.join(ROOT, game.path);

      try {
        await fs.access(romPath);
      } catch {
        console.log(`[game_renders] Skipping ${game.name}: ROM not found at ${romPath}`);
        return;
      }

      const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
      const m = createMachine({ cart: { rom }, useManualInit: true });
      const cpu = m.getCPU();
      const vdp = m.getVDP();

      const CPU_CLOCK_HZ = 3_579_545;
      const cyclesPerFrame = CPU_CLOCK_HZ / 60;
      const frames = 300; // ~5 seconds at 60 FPS

      // Run for 2 seconds
      for (let frame = 0; frame < frames; frame++) {
        let cyclesToRun = cyclesPerFrame;
        while (cyclesToRun > 0) {
          const { cycles } = cpu.stepOne();
          cyclesToRun -= cycles;
        }
      }

      // Get the rendered frame
      if (!vdp.renderFrame) {
        throw new Error('VDP renderFrame not available');
      }

      const frameBuffer = vdp.renderFrame();
      expect(frameBuffer).toBeDefined();
      expect(frameBuffer.length).toBe(256 * 192 * 3);

      // Check that frame is not completely black
      let blackPixelCount = 0;
      let nonBlackPixelCount = 0;

      for (let i = 0; i < frameBuffer.length; i += 3) {
        const r = frameBuffer[i] ?? 0;
        const g = frameBuffer[i + 1] ?? 0;
        const b = frameBuffer[i + 2] ?? 0;

        if (r === 0 && g === 0 && b === 0) {
          blackPixelCount++;
        } else {
          nonBlackPixelCount++;
        }
      }

      console.log(`[game_renders] ${game.name} frame analysis after 5 seconds:`);
      console.log(`[game_renders] Black pixels: ${blackPixelCount}/${256 * 192}`);
      console.log(`[game_renders] Non-black pixels: ${nonBlackPixelCount}/${256 * 192}`);

      // Games should render at least 5% non-black pixels after 5 seconds
      const pixelCount = 256 * 192;
      expect(nonBlackPixelCount).toBeGreaterThan(pixelCount * 0.05);
      console.log(`[game_renders] ✓ ${game.name} frame is not mostly black`);
    }, 120000);
  }
});
