import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const traceVDPStatusReads = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const bus = m.getBus();
  const vdp = m.getVDP();

  // Instrument readIO8 to track port 0xBF reads
  const originalRead = bus.readIO8.bind(bus);
  let statusReadCount = 0;
  const statusReads: { cycle: number; pc: number; value: number }[] = [];

  bus.readIO8 = (port: number): number => {
    const val = originalRead(port);
    if ((port & 0xff) === 0xbf || (port & 0xff) === 0x9f) {
      statusReadCount++;
      const state = cpu.getState();
      statusReads.push({ cycle: 0, pc: state.pc & 0xffff, value });
      if (statusReadCount <= 20 || statusReadCount % 100 === 0) {
        console.log(`Status read #${statusReadCount}: PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}, value=0x${val.toString(16).padStart(2, '0')}`);
      }
    }
    return val;
  };

  // Run for ~5 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 5;

  console.log('Running Sonic and tracing VDP status reads...\n');

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Total VDP status reads (port 0xBF): ${statusReadCount}`);
  console.log(`Frames run: ${Math.floor(cyclesExecuted / FRAME_CYCLES)}`);

  if (statusReadCount === 0) {
    console.log('\n❌ CRITICAL: Sonic never reads VDP status port!');
    console.log('   This explains the IRQ loop - IRQ flag is never cleared.');
    console.log('   Solution: Either:');
    console.log('   1. Implement automatic IRQ clearing on ISR entry (non-standard)');
    console.log('   2. Check if Sonic expects IRQ auto-cleared by CPU after acceptance');
    console.log('   3. Verify our IRQ masking/gating logic matches real hardware');
  } else {
    console.log(`\n✅ Sonic does read VDP status (${statusReadCount} reads in ${Math.floor(cyclesExecuted / FRAME_CYCLES)} frames)`);
    console.log('   → ISR re-entry is likely not the issue');
    console.log('   → Audio silence must be from a different cause');
  }

  const psgState = vdp.getState?.();
  console.log(`\nFinal VDP status register: 0x${(psgState?.status ?? 0).toString(16).padStart(2, '0')}`);
};

traceVDPStatusReads().catch(console.error);
