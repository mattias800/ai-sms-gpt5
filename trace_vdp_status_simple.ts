import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Simple approach: just check if VDP status register changes
 * If IRQ flag is being cleared, we should see status register transitions
 */
const traceVDPStatus = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const vdp = m.getVDP();

  let lastStatus = 0;
  let statusChangeCount = 0;
  let irqActiveCount = 0;

  // Run for ~5 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 5;

  console.log('Tracing VDP status register changes...\n');

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const vdpState = vdp.getState?.();
    const currentStatus = vdpState?.status ?? 0;

    // Track IRQ wire
    if (vdp.hasIRQ()) {
      irqActiveCount++;
    }

    // Track status register changes
    if (currentStatus !== lastStatus) {
      statusChangeCount++;
      const state = cpu.getState();
      if (statusChangeCount <= 20) {
        console.log(`Status change #${statusChangeCount} @ cycle ${cyclesExecuted}: 0x${lastStatus.toString(16).padStart(2, '0')} → 0x${currentStatus.toString(16).padStart(2, '0')}, PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`);
      }
      lastStatus = currentStatus;
    }
  }

  const framesRun = Math.floor(cyclesExecuted / FRAME_CYCLES);

  console.log(`\n=== RESULTS ===`);
  console.log(`Frames run: ${framesRun}`);
  console.log(`Status register changes: ${statusChangeCount}`);
  console.log(`Cycles with IRQ active: ${irqActiveCount} (${(irqActiveCount / cyclesExecuted * 100).toFixed(1)}% of time)`);
  console.log(`Final status: 0x${lastStatus.toString(16).padStart(2, '0')}`);

  // Analysis
  if (statusChangeCount === 0) {
    console.log('\n❌ Status register never changed - no IRQ flag clearing detected');
    console.log('   This confirms Sonic never reads VDP status port');
  } else {
    const changesPerFrame = statusChangeCount / framesRun;
    console.log(`\n✅ Status changes: ${changesPerFrame.toFixed(1)} per frame`);
    if (changesPerFrame >= 1.5) {
      console.log('   → Normal: status is being set and cleared each frame');
    } else {
      console.log('   → Abnormal: status should change ~2 times per frame (set + clear)');
    }
  }

  if (irqActiveCount > cyclesExecuted * 0.8) {
    console.log('\n❌ CRITICAL: IRQ is active >80% of the time');
    console.log('   This confirms IRQ flag is never being cleared');
    console.log('   → Fix: Ensure VDP status reads properly clear the IRQ flag');
  }
};

traceVDPStatus().catch(console.error);