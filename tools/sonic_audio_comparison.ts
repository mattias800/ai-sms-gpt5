import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Deep dive into Sonic's audio initialization
 * Answer the question: Does Sonic actually unmute audio on real hardware?
 */

const main = async () => {
  console.log('=== SONIC AUDIO INITIALIZATION DEEP DIVE ===\n');

  // Load Sonic
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  const cpu = m.getCPU();
  const bus = m.getBus();

  // Track all relevant events
  const events: any[] = [];

  // Hook PSG writes
  const originalPsgWrite = bus.writeIO8.bind(bus);
  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const isVolumeCmd = (val & 0x80) && (val & 0x10);
      const isToneCmd = (val & 0x80) && !(val & 0x10);
      const isNoiseCmd = (val & 0x80) && (val & 0x60) === 0x60;

      events.push({
        type: 'PSG_WRITE',
        pc: state.pc & 0xffff,
        sp: state.sp & 0xffff,
        port: port & 0xff,
        val: val & 0xff,
        isVolumeCmd,
        isToneCmd,
        isNoiseCmd,
        cycles: state.cycleCount,
      });

      if (isVolumeCmd) {
        const ch = (val >> 5) & 0x03;
        const vol = val & 0x0f;
        console.log(
          `[${events.length}] PSG Volume: CH${ch} VOL=${vol} (${vol === 15 ? 'MUTE' : 'AUDIBLE'}) @ PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`
        );
      }
    }
    return originalPsgWrite(port, val);
  };

  // Hook VDP status reads (IRQ clears)
  const originalVdpRead = bus.readIO8.bind(bus);
  bus.readIO8 = (port: number) => {
    const val = originalVdpRead(port);
    if ((port & 0xff) === 0xbf) {
      const state = cpu.getState();
      if (val & 0x80) {
        events.push({
          type: 'VDP_STATUS_READ_IRQ_PENDING',
          pc: state.pc & 0xffff,
          val,
          cycles: state.cycleCount,
        });
      }
    }
    return val;
  };

  // Track ISR entries by monitoring PC changes to ISR vectors
  // We'll detect these by looking at jump to 0x0038, 0x0066, etc.
  let lastPc = 0;
  const isrVectors = [0x0038, 0x0066]; // IM1 and NMI vectors

  // Run first 15 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 15;

  console.log('\n--- Running first 15 frames ---\n');

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  // Analyze results
  console.log('\n=== ANALYSIS ===\n');

  const volumeWrites = events.filter(e => e.type === 'PSG_WRITE' && e.isVolumeCmd);
  const unmutes = volumeWrites.filter(e => e.val & 0x0f < 0xf);
  const mutes = volumeWrites.filter(e => (e.val & 0x0f) === 0xf);

  console.log(`Total PSG writes: ${events.filter(e => e.type === 'PSG_WRITE').length}`);
  console.log(`Volume commands: ${volumeWrites.length}`);
  console.log(`  - Unmutes (vol<15): ${unmutes.length}`);
  console.log(`  - Mutes (vol=15): ${mutes.length}`);
  console.log(`VDP status reads with IRQ pending: ${events.filter(e => e.type === 'VDP_STATUS_READ_IRQ_PENDING').length}`);

  if (unmutes.length === 0) {
    console.log('\n🔴 CRITICAL FINDING: Sonic never unmutes audio in our emulator!');
    console.log('\nPossible explanations:');
    console.log('1. Audio driver code is never reached from ISR');
    console.log('2. Audio driver uses a different port (not 0x7F/0xFF)');
    console.log('3. Audio driver is conditional on a flag we never set');
    console.log('4. Our ISR entry conditions prevent audio code from running');
  } else {
    console.log(`\n✅ Audio unmutes successfully at ${unmutes.length} points`);
  }

  // Show VDP status read events (these clear IRQ flag)
  console.log('\n--- VDP Status Reads (IRQ clears) ---');
  const vdpReads = events.filter(e => e.type === 'VDP_STATUS_READ_IRQ_PENDING').slice(0, 5);
  for (const read of vdpReads) {
    console.log(`VDP status read @ PC=0x${read.pc.toString(16).padStart(4, '0')}: val=0x${read.val.toString(16).padStart(2, '0')}`);
  }

  // Show PSG write locations
  console.log('\n--- PSG Write Locations (first 10) ---');
  const psgWrites = events.filter(e => e.type === 'PSG_WRITE').slice(0, 10);
  for (const write of psgWrites) {
    const type = write.isToneCmd ? 'TONE' : write.isVolumeCmd ? 'VOL' : 'OTHER';
    console.log(`${type} @ PC=0x${write.pc.toString(16).padStart(4, '0')}: val=0x${write.val.toString(16).padStart(2, '0')}`);
  }

  // Next step recommendation
  console.log('\n=== NEXT STEP ===');
  if (unmutes.length === 0) {
    console.log('Run: npm run trace:sms && npm run compare:mame');
    console.log('Then compare what MAME shows for Sonic PSG volume writes');
    console.log('Does MAME also never unmute, or is this an emulator bug?');
  }
};

main().catch(console.error);
