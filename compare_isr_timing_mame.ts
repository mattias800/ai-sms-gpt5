import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Compare ISR timing between our emulator and theoretical MAME reference
 * This script measures how long Sonic's VBlank ISR takes in our emulator
 * and compares it against what we know about hardware behavior
 */

const compareISRTiming = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const vdp = m.getVDP();
  const psg = m.getPSG();

  const CPU_CLOCK_HZ = 3_579_545;
  const FRAME_CYCLES = 228 * 262; // cycles per frame (228 per line, 262 lines)
  
  console.log('=== ISR TIMING ANALYSIS ===\n');
  console.log(`CPU Clock: ${CPU_CLOCK_HZ} Hz`);
  console.log(`Cycles per frame: ${FRAME_CYCLES} (~${(FRAME_CYCLES / 60).toFixed(0)} cycles @ 60 FPS)`);
  console.log(`Expected VBlank at line 192 = ${228 * 192} cycles into frame\n`);

  // Run for several frames and measure ISR cycle costs
  const isrCycleCosts: number[] = [];
  let cyclesExecuted = 0;
  let isrStartCycle = 0;
  let lastIFF1 = true;
  let frameNum = 0;
  let currentFrame = 0;

  // Run for ~10 frames
  const targetCycles = FRAME_CYCLES * 10;

  console.log('Tracing ISR cycle costs...\n');

  while (cyclesExecuted < targetCycles) {
    const prevIFF1 = lastIFF1;
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const state = cpu.getState();
    const currIFF1 = !!state.iff1;

    // Track frame boundaries
    if (cyclesExecuted > (currentFrame + 1) * FRAME_CYCLES) {
      frameNum++;
      currentFrame++;
    }

    // Detect ISR entry: IFF1 transition from true to false
    if (prevIFF1 && !currIFF1) {
      isrStartCycle = cyclesExecuted;
    }

    // Detect ISR exit: IFF1 transition from false to true
    if (!prevIFF1 && currIFF1) {
      const isrEndCycle = cyclesExecuted;
      const isrCost = isrEndCycle - isrStartCycle;
      isrCycleCosts.push(isrCost);

      // Calculate position in frame
      const frameOffset = cyclesExecuted % FRAME_CYCLES;
      const lineNum = Math.floor(frameOffset / 228);

      console.log(`Frame ${frameNum}: ISR took ${isrCost} cycles (${(isrCost / FRAME_CYCLES * 100).toFixed(1)}% of frame, returned at line ${lineNum})`);
    }

    lastIFF1 = currIFF1;
  }

  // Analysis
  if (isrCycleCosts.length === 0) {
    console.log('\nNo ISR executions detected!');
    return;
  }

  const avgCost = isrCycleCosts.reduce((a, b) => a + b, 0) / isrCycleCosts.length;
  const minCost = Math.min(...isrCycleCosts);
  const maxCost = Math.max(...isrCycleCosts);

  console.log(`\n=== ISR COST STATISTICS ===`);
  console.log(`Average: ${avgCost.toFixed(0)} cycles (${(avgCost / FRAME_CYCLES * 100).toFixed(1)}% of frame)`);
  console.log(`Min: ${minCost} cycles`);
  console.log(`Max: ${maxCost} cycles`);
  console.log(`Count: ${isrCycleCosts.length} ISR executions\n`);

  // Interpretation
  console.log('=== INTERPRETATION ===');
  if (avgCost < 5000) {
    console.log('✅ ISR timing looks reasonable (< 8% of frame)');
    console.log('   → Issue is likely VDP IRQ flag clearing, not CPU timing');
    console.log('   → Verify Sonic reads port 0xBF in MAME to clear IRQ');
  } else if (avgCost < 15000) {
    console.log('⚠️  ISR timing is moderate (8-25% of frame)');
    console.log('   → Could be legitimate game code, check against MAME');
  } else {
    console.log('❌ ISR timing is very high (>25% of frame, ~entire frame duration)');
    console.log('   → This matches observed behavior: ISR takes ~45k cycles');
    console.log('   → Two possibilities:');
    console.log('   1. Our CPU T-state counts are wrong (instructions take too long)');
    console.log('   2. Sonic\'s ISR is legitimately long and never reads VDP status');
    console.log('   → Need MAME trace to disambiguate');
  }

  // VDP status read check
  console.log('\n=== VDP STATUS READ CHECK ===');
  console.log('To verify if Sonic reads VDP status (port 0xBF) to clear IRQ:');
  console.log('1. Use: DEBUG_BUS_IO=1 npm run test:audio');
  console.log('2. Or create a quick instrumentation in bus.readIO8(0xBF)');
  console.log('3. Check if Sonic ever calls this port');

  const psgFinal = psg.getState();
  console.log(`\n=== SONIC STATE AFTER ${Math.floor(cyclesExecuted / FRAME_CYCLES)} FRAMES ===`);
  console.log(`PSG Volumes: [${psgFinal.vols.join(', ')}] (0xF=muted)`);
  console.log(`Any unmuted: ${psgFinal.vols.some(v => (v & 0xf) < 0xf) ? 'YES' : 'NO'}`);
};

compareISRTiming().catch(console.error);
