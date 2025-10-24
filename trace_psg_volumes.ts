import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const tracePSGVolumes = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const psg = m.getPSG();

  // Patch PSG write to trace volume changes
  const originalWrite = psg.write;
  let volumeWriteCount = 0;
  let sonicHasUnmuted = false;
  const volumeEvents: { cycle: number; pc: number; vol: number; ch: number }[] = [];

  psg.write = (val: number) => {
    // Parse the write
    if (val & 0x80) {
      const channel = (val >>> 5) & 0x03;
      const isVolume = (val & 0x10) !== 0;
      const data = val & 0x0f;

      if (isVolume && data < 0xf) {
        // Volume unmute detected
        volumeWriteCount++;
        const state = cpu.getState();
        volumeEvents.push({ cycle: 0, pc: state.pc & 0xffff, vol: data, ch: channel });

        if (!sonicHasUnmuted) {
          sonicHasUnmuted = true;
          console.log(`🔊 FIRST UNMUTE at PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`);
        }

        if (volumeWriteCount <= 30) {
          console.log(`  Vol write #${volumeWriteCount}: CH${channel} volume=${data} @ PC=0x${(state.pc & 0xffff).toString(16).padStart(4, '0')}`);
        }
      }
    }

    return originalWrite.call(this, val);
  };

  // Run for ~10 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 10;

  console.log('Tracing PSG volume writes during Sonic execution...\n');

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  const framesRun = Math.floor(cyclesExecuted / FRAME_CYCLES);
  const psgState = psg.getState();

  console.log(`\n=== RESULTS ===`);
  console.log(`Frames run: ${framesRun}`);
  console.log(`PSG volume write count: ${volumeWriteCount}`);
  console.log(`Sonic unmuted audio: ${sonicHasUnmuted ? 'YES' : 'NO'}`);
  console.log(`\nFinal PSG volumes: [${psgState.vols.join(', ')}]`);
  console.log(`Any audible: ${psgState.vols.some(v => (v & 0xf) < 0xf) ? 'YES' : 'NO'}`);

  if (!sonicHasUnmuted) {
    console.log('\n❌ CRITICAL: Sonic NEVER writes volume unmute commands!');
    console.log('   → PSG volumes stay at 0xF (muted) the entire time');
    console.log('   → This is why there\'s no audio, not an IRQ issue');
    console.log('   → Possible causes:');
    console.log('   1. Sonic\'s ISR never executes the unmute routine');
    console.log('   2. Sonic expects a different initialization sequence');
    console.log('   3. Our ISR is executing different code than expected');
  }
};

tracePSGVolumes().catch(console.error);
