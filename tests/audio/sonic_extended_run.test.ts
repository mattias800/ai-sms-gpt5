import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic extended execution', () => {
  it('runs for 10 seconds to see if game escapes polling loop', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerSecond = CPU_CLOCK_HZ;
    const secondsToRun = 10;
    const totalCycles = cyclesPerSecond * secondsToRun;

    let cyclesRun = 0;
    let stuckInLoopCount = 0;
    let lastPC = 0;
    let lastPCChangeAtCycle = 0;

    const samplePoints = [1, 2, 3];
    let sampleIdx = 0;
    let nextSampleCycle = cyclesPerSecond * samplePoints[sampleIdx];

    console.log(`[extended] Running for ${Math.min(3, secondsToRun)} seconds (sample)...`);

    while (cyclesRun < totalCycles) {
      const state = cpu.getState();
      const pc = state.pc & 0xffff;

      const { cycles } = cpu.stepOne();
      cyclesRun += cycles;

      // Check if PC in tight loop (0x031C-0x0320)
      if (pc === 0x031C || pc === 0x0320) {
        stuckInLoopCount++;
      } else if (pc !== lastPC) {
        lastPC = pc;
        lastPCChangeAtCycle = cyclesRun;
      }

      // Sample at key points
      if (cyclesRun >= nextSampleCycle) {
        const seconds = samplePoints[sampleIdx];
        console.log(`[extended] @ ${seconds}s: PC=0x${pc.toString(16).padStart(4,'0')}, Loop count=${stuckInLoopCount}, Cycles=${cyclesRun}`);
        sampleIdx++;
        if (sampleIdx < samplePoints.length) {
          nextSampleCycle = cyclesPerSecond * samplePoints[sampleIdx];
        }
      }
    }

    const loopPercentage = (stuckInLoopCount / (totalCycles / 4)) * 100; // Approximate instruction ratio
    console.log(`\n[extended] Final stats:`);
    console.log(`  Total cycles: ${cyclesRun}`);
    console.log(`  Loop iterations: ${stuckInLoopCount}`);
    console.log(`  Final PC: 0x${cpu.getState().pc.toString(16).padStart(4,'0')}`);
    console.log(`  Loop execution: ~${loopPercentage.toFixed(1)}% of time`);

    if (loopPercentage > 50) {
      console.log(`  ❌ STUCK: Game remains in polling loop for entire duration`);
    } else {
      console.log(`  ✓ Game escaped polling loop`);
    }
  }, 300000); // 5-minute timeout
});
