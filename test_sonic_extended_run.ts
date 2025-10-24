import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Test Sonic for a much longer period with multiple button presses
const testSonicExtendedRun = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();
  const controller1 = m.getController1();

  // Track detailed PSG writes with focus on data bytes
  const originalWrite = psg.write;
  let psgWriteCount = 0;
  let dataByteWrites = 0;
  let toneLatches = 0;

  psg.write = (val) => {
    psgWriteCount++;
    const seconds = psgWriteCount * 0.0001;

    if (val & 0x80) {
      // Latch byte
      const channel = (val >>> 5) & 0x03;
      const isVolume = (val & 0x10) !== 0;
      const data = val & 0x0f;

      if (!isVolume && channel < 3) {
        toneLatches++;
        if (data > 0) {
          console.log(`${seconds.toFixed(1)}s: TONE Ch${channel} low=${data} ✨ NON-ZERO!`);
        }
      }
    } else {
      // Data byte - this is what we're looking for!
      dataByteWrites++;
      const data = val & 0x3f;
      console.log(`${seconds.toFixed(1)}s: 🎵 DATA BYTE=${data} (FINALLY!)`);
    }

    return originalWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 60; // Run for 1 minute
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Running extended Sonic session (60s) looking for data bytes...');

  let lastButtonPress = 0;
  let buttonPressCount = 0;

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;

    // Press buttons periodically to try different game states
    if (Math.floor(emulatedSec) > lastButtonPress + 5) {
      buttonPressCount++;
      lastButtonPress = Math.floor(emulatedSec);

      console.log(`\n--- ${emulatedSec.toFixed(1)}s: Button press #${buttonPressCount} ---`);

      // Cycle through different button combinations
      switch (buttonPressCount % 4) {
        case 0:
          controller1?.setState({ button1: true }); // Start/Select
          break;
        case 1:
          controller1?.setState({ button2: true }); // A/B button
          break;
        case 2:
          controller1?.setState({ up: true }); // D-pad
          break;
        case 3:
          controller1?.setState({}); // Release all buttons
          break;
      }
    }

    // Progress update every 10 seconds
    if (cyclesExecuted % (CPU_CLOCK_HZ * 10) === 0) {
      const realTime = Date.now() - startTime;
      console.log(`\n=== ${emulatedSec.toFixed(0)}s emulated (${realTime}ms real) ===`);
      console.log(`PSG writes: ${psgWriteCount}, Tone latches: ${toneLatches}, Data bytes: ${dataByteWrites}`);

      const state = psg.getState();
      const nonZeroTones = state.tones.filter(t => t > 0);
      const activeVols = state.vols.map((v, i) => v < 15 ? `Ch${i}:${v}` : null).filter(x => x);

      console.log(`Current: Tones=[${state.tones.join(',')}] Active vols=[${activeVols.join(',')}]`);

      if (nonZeroTones.length > 0) {
        console.log(`🎵 BREAKTHROUGH: Found non-zero frequencies! ${nonZeroTones}`);
        break; // Stop if we find music
      }
    }
  }

  const endTime = Date.now();
  console.log(`\nCompleted: ${endTime - startTime}ms real time`);
  console.log(`Total PSG writes: ${psgWriteCount}`);
  console.log(`Tone latches: ${toneLatches}`);
  console.log(`Data bytes: ${dataByteWrites} ${dataByteWrites > 0 ? '🎵' : '❌'}`);

  const finalState = psg.getState();
  console.log(`\nFinal PSG State:`);
  console.log(`  Tones: [${finalState.tones.join(', ')}]`);
  console.log(`  Volumes: [${finalState.vols.join(', ')}]`);

  const hasMusic = finalState.tones.some(t => t > 0);
  console.log(`\nResult: ${hasMusic ? '✅ MUSIC DETECTED' : '❌ NO MUSIC'}`);

  if (dataByteWrites === 0) {
    console.log('\n🔍 Diagnosis: Game NEVER writes PSG data bytes');
    console.log('This could mean:');
    console.log('  1. This Sonic ROM has no music (unusual for Sonic)');
    console.log('  2. Game requires specific initialization sequence');
    console.log('  3. Music system is disabled or not triggered');
    console.log('  4. Emulator missing some hardware feature needed for audio');
  }
};

testSonicExtendedRun().catch(console.error);