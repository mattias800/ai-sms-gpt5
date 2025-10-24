import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Debug BIOS+Sonic PSG writes to understand the frequency issue
const debugBiosSonicPSG = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();

  // Track detailed PSG writes
  const originalWrite = psg.write;
  let psgWriteCount = 0;
  let lastToneWrite: {val: number, time: number} | null = null;
  let expectingDataByte = false;
  let lastLatchedChannel = -1;

  psg.write = (val) => {
    psgWriteCount++;
    const seconds = psgWriteCount * 0.0001; // Rough time estimate

    if (val & 0x80) {
      // Latch + data byte
      const channel = (val >>> 5) & 0x03;
      const isVolume = (val & 0x10) !== 0;
      const data = val & 0x0f;

      if (!isVolume && channel < 3) {
        // Tone frequency latch
        lastToneWrite = {val, time: seconds};
        expectingDataByte = true;
        lastLatchedChannel = channel;

        if (psgWriteCount <= 50 || (psgWriteCount > 1000 && psgWriteCount % 200 === 0)) {
          console.log(`${seconds.toFixed(1)}s: TONE Ch${channel} low=${data} (waiting for high bits...)`);
        }
      } else if (isVolume) {
        if (psgWriteCount <= 50 || (psgWriteCount > 1000 && psgWriteCount % 200 === 0)) {
          console.log(`${seconds.toFixed(1)}s: VOL Ch${channel}=${data} ${data < 15 ? '(AUDIBLE)' : '(MUTED)'}`);
        }
      }
    } else {
      // Data byte
      const data = val & 0x3f;

      if (expectingDataByte && lastToneWrite && lastLatchedChannel >= 0) {
        const lowBits = lastToneWrite.val & 0x0f;
        const fullFreq = (data << 4) | lowBits;

        if (psgWriteCount <= 50 || (psgWriteCount > 1000 && psgWriteCount % 200 === 0) || fullFreq > 0) {
          console.log(`${seconds.toFixed(1)}s: DATA Ch${lastLatchedChannel} high=${data} -> FREQ=${fullFreq} ${fullFreq > 0 ? '✅' : '❌ (ZERO FREQ)'}`);
        }

        expectingDataByte = false;
        lastToneWrite = null;
        lastLatchedChannel = -1;
      } else {
        if (psgWriteCount <= 50) {
          console.log(`${seconds.toFixed(1)}s: DATA ${data} (unexpected - no tone latch)`);
        }
      }
    }

    return originalWrite(val);
  };

  // Run for sufficient time to see BIOS + game transition
  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 8; // 8 seconds should cover BIOS + game start
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Running BIOS+Sonic sequence with detailed PSG tracing...');
  console.log('Expected: BIOS (0-3s) then game music (3s+)');

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    // Progress update every emulated second
    if (cyclesExecuted % CPU_CLOCK_HZ === 0) {
      const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;
      console.log(`\n--- ${emulatedSec}s elapsed, ${psgWriteCount} PSG writes ---`);

      const state = psg.getState();
      const activeFreqs = state.tones.filter(t => t > 0);
      const activeVols = state.vols.map((v, i) => v < 15 ? `Ch${i}:${v}` : null).filter(x => x);

      console.log(`PSG State: Active freqs=[${activeFreqs.join(',')}] Active vols=[${activeVols.join(',')}]`);
    }
  }

  console.log(`\nCompleted: ${(Date.now() - startTime)}ms real time, ${psgWriteCount} total PSG writes`);

  // Final analysis
  const finalState = psg.getState();
  console.log(`\nFinal PSG State:`);
  console.log(`  Tones: [${finalState.tones.join(', ')}]`);
  console.log(`  Volumes: [${finalState.vols.join(', ')}]`);

  const hasMusic = finalState.tones.some(t => t > 0) && finalState.vols.some(v => v < 15);
  console.log(`\nMusic Status: ${hasMusic ? '✅ DETECTED' : '❌ MISSING'}`);

  if (!hasMusic) {
    console.log('Issue: All frequencies are 0, even though PSG writes are happening');
    console.log('This suggests either:');
    console.log('  1. Game only writes frequency value 0 (like BIOS)');
    console.log('  2. Data bytes are not being written properly');
    console.log('  3. Game audio system is not fully initialized');
  }
};

debugBiosSonicPSG().catch(console.error);