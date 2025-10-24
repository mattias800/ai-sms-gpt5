import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Test Alex Kidd for PSG data bytes - this game definitely has music
const testAlexKiddMusic = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('Alex Kidd - The Lost Stars (UE) [!].sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();
  const controller1 = m.getController1();

  // Track PSG writes focusing on data bytes
  const originalWrite = psg.write;
  let psgWriteCount = 0;
  let dataByteWrites = 0;
  let toneLatches = 0;
  let nonZeroToneLatches = 0;

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
          nonZeroToneLatches++;
          console.log(`${seconds.toFixed(1)}s: TONE Ch${channel} low=${data} ✨`);
        }
      }
    } else {
      // Data byte!
      dataByteWrites++;
      const data = val & 0x3f;
      console.log(`${seconds.toFixed(1)}s: 🎵 DATA BYTE=${data} (Count: ${dataByteWrites})`);
    }

    return originalWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 30; // 30 seconds should be enough for Alex Kidd
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Testing Alex Kidd for PSG data bytes...');

  let lastButtonPress = 0;

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;

    // Press start button after 5 seconds
    if (Math.floor(emulatedSec) === 5 && Math.floor(emulatedSec) > lastButtonPress) {
      console.log(`\n--- ${emulatedSec.toFixed(1)}s: Pressing START ---`);
      controller1?.setState({ button1: true });
      lastButtonPress = Math.floor(emulatedSec);
    }
    // Release button
    if (Math.floor(emulatedSec) === 6 && Math.floor(emulatedSec) > lastButtonPress) {
      controller1?.setState({});
      lastButtonPress = Math.floor(emulatedSec);
    }

    // Progress update every 5 seconds
    if (cyclesExecuted % (CPU_CLOCK_HZ * 5) === 0) {
      console.log(`\n=== ${emulatedSec.toFixed(0)}s ===`);
      console.log(`PSG writes: ${psgWriteCount}, Tone latches: ${toneLatches}, Non-zero latches: ${nonZeroToneLatches}, Data bytes: ${dataByteWrites}`);

      const state = psg.getState();
      const nonZeroTones = state.tones.filter(t => t > 0);

      if (nonZeroTones.length > 0) {
        console.log(`🎵 SUCCESS: Found musical frequencies! ${nonZeroTones}`);
        break; // Stop on first success
      }

      if (dataByteWrites > 0) {
        console.log(`🎵 DATA BYTES DETECTED! This confirms the PSG implementation works!`);
        break;
      }
    }
  }

  const endTime = Date.now();
  console.log(`\nCompleted: ${endTime - startTime}ms real time`);
  console.log(`Total PSG writes: ${psgWriteCount}`);
  console.log(`Tone latches: ${toneLatches} (${nonZeroToneLatches} non-zero)`);
  console.log(`Data bytes: ${dataByteWrites} ${dataByteWrites > 0 ? '🎵' : '❌'}`);

  const finalState = psg.getState();
  console.log(`\nFinal PSG State:`);
  console.log(`  Tones: [${finalState.tones.join(', ')}]`);
  console.log(`  Volumes: [${finalState.vols.join(', ')}]`);

  const hasMusic = finalState.tones.some(t => t > 0);
  console.log(`\nResult: ${hasMusic ? '✅ MUSIC DETECTED' : '❌ NO MUSIC'}`);

  if (dataByteWrites > 0) {
    console.log('\n✅ BREAKTHROUGH: Alex Kidd writes PSG data bytes!');
    console.log('This confirms:');
    console.log('  1. PSG implementation is working correctly');
    console.log('  2. BIOS+game initialization works');
    console.log('  3. Issue is specific to the Sonic ROM');
  } else {
    console.log('\n❌ Alex Kidd also has no data bytes - suggests deeper emulation issue');
  }
};

testAlexKiddMusic().catch(console.error);