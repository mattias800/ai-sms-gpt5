import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';
import path from 'path';

const DEBUG_SONIC_COMPREHENSIVE = async () => {
  const ROOT = process.cwd();
  const sonicPath = path.join(ROOT, 'sonic.sms');
  const biosPath = path.join(ROOT, 'third_party/mame/roms/sms1/mpr-10052.rom');

  // Check if files exist
  try {
    await fs.access(sonicPath);
  } catch {
    console.log('sonic.sms not found - cannot run comprehensive analysis');
    return;
  }

  let bios: Uint8Array | undefined;
  try {
    bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
    console.log('✓ Using BIOS for hardware initialization');
  } catch {
    console.log('⚠ BIOS not found - running without BIOS initialization');
  }

  const rom = new Uint8Array((await fs.readFile(sonicPath)).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();
  const controller1 = m.getController1();
  const bus = m.getBus();

  const sampleRate = 22050;
  const seconds = 30.0; // Extended time to ensure we catch music
  const totalSamples = Math.floor(sampleRate * seconds);
  const CPU_CLOCK_HZ = 3_579_545;
  const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;

  let carry = 0;
  let inputSequence = [
    // Comprehensive input sequence for Sonic title screen navigation
    { time: 5.0, input: { button1: true }, note: 'Start button press' },
    { time: 5.1, input: { button1: false }, note: 'Start button release' },
    { time: 7.0, input: { button1: true }, note: 'Start again (menu select)' },
    { time: 7.1, input: { button1: false }, note: 'Start release' },
    { time: 9.0, input: { down: true }, note: 'Down button (menu nav)' },
    { time: 9.1, input: { down: false }, note: 'Down release' },
    { time: 10.0, input: { button1: true }, note: 'Start (confirm selection)' },
    { time: 10.1, input: { button1: false }, note: 'Start release' },
    { time: 12.0, input: { up: true }, note: 'Up button' },
    { time: 12.1, input: { up: false }, note: 'Up release' },
    { time: 14.0, input: { button2: true }, note: 'Button 2 press' },
    { time: 14.1, input: { button2: false }, note: 'Button 2 release' },
    { time: 16.0, input: { button1: true }, note: 'Start (game start)' },
    { time: 16.1, input: { button1: false }, note: 'Start release' },
    { time: 18.0, input: { right: true }, note: 'Right (move Sonic)' },
    { time: 20.0, input: { right: false, button1: true }, note: 'Jump button' },
    { time: 20.1, input: { button1: false }, note: 'Jump release' },
  ];

  let inputIndex = 0;
  let lastPsgLogTime = -1;
  let biosDisableDetected = false;

  console.log('\n🎮 Comprehensive Sonic Music Detection Test');
  console.log('============================================');
  console.log('Strategy: Multiple input sequences + extended runtime');
  console.log(`Total runtime: ${seconds}s`);
  console.log();

  // Track BIOS state access
  const getBiosEnabled = () => {
    try {
      return (bus as any).biosEnabled;
    } catch {
      return 'unknown';
    }
  };

  for (let i = 0; i < totalSamples; i++) {
    carry += cyclesPerSample;
    let toRun = Math.floor(carry);
    carry -= toRun;

    const currentTime = i / sampleRate;

    // Execute input sequence
    if (inputIndex < inputSequence.length && currentTime >= inputSequence[inputIndex].time) {
      const cmd = inputSequence[inputIndex];
      console.log(`🎮 ${currentTime.toFixed(1)}s: ${cmd.note}`);
      controller1?.setState(cmd.input);
      inputIndex++;
    }

    // Check for BIOS disable
    const biosEnabled = getBiosEnabled();
    if (!biosDisableDetected && biosEnabled === false) {
      biosDisableDetected = true;
      console.log(`🔧 ${currentTime.toFixed(1)}s: BIOS DISABLED - Game can now initialize audio`);
    }

    while (toRun > 0) {
      const { cycles } = cpu.stepOne();
      toRun -= cycles;
    }

    // Check PSG state every 1 second and whenever something changes
    if (Math.floor(currentTime) > lastPsgLogTime) {
      lastPsgLogTime = Math.floor(currentTime);

      const state = psg.getState();
      const activeVols = state.vols.map((v, ch) => v < 15 ? `${ch}:${v}` : null).filter(Boolean);
      const activeTones = state.tones.map((t, ch) => t > 0 ? `${ch}:${t}` : null).filter(Boolean);

      if (activeVols.length > 0 || activeTones.length > 0) {
        console.log(`🎵 ${currentTime.toFixed(1)}s: PSG Activity - Vols:[${activeVols.join(',')}] Tones:[${activeTones.join(',')}] BIOS:${biosEnabled}`);
      }

      // If we detect any musical tones, report it immediately
      if (activeTones.length > 0) {
        console.log(`🎉 MUSICAL CONTENT DETECTED at ${currentTime.toFixed(1)}s!`);
        console.log(`   Active Tones: ${activeTones.join(', ')}`);
        console.log(`   Active Volumes: ${activeVols.join(', ')}`);

        // Continue for a bit to see the pattern
        for (let extraCheck = 0; extraCheck < 5; extraCheck++) {
          // Run a small amount more
          for (let j = 0; j < sampleRate * 0.2; j++) { // 0.2 seconds
            carry += cyclesPerSample;
            let extraRun = Math.floor(carry);
            carry -= extraRun;
            while (extraRun > 0) {
              const { cycles } = cpu.stepOne();
              extraRun -= cycles;
            }
          }

          const checkState = psg.getState();
          const checkTones = checkState.tones.map((t, ch) => t > 0 ? `${ch}:${t}` : null).filter(Boolean);
          if (checkTones.length > 0) {
            const checkTime = currentTime + (extraCheck + 1) * 0.2;
            console.log(`🎵 ${checkTime.toFixed(1)}s: Continued music - Tones:[${checkTones.join(',')}]`);
          }
        }

        console.log('\n✅ SUCCESS: Musical content confirmed in Sonic emulation!');
        return;
      }
    }
  }

  // Final summary
  console.log('\n📊 Final Analysis:');
  const finalState = psg.getState();
  console.log(`BIOS Status: ${getBiosEnabled()}`);
  console.log(`PSG Final Volumes: [${finalState.vols.join(', ')}]`);
  console.log(`PSG Final Tones: [${finalState.tones.join(', ')}]`);
  console.log(`BIOS Disable Detected: ${biosDisableDetected}`);

  // Check if we had any volume activity (indicating PSG is working)
  const hadVolumeActivity = finalState.vols.some(v => v < 15);

  if (hadVolumeActivity) {
    console.log('\n✅ PSG hardware functional (volume activity detected)');
    console.log('❌ No musical tone frequencies detected');
    console.log('\nPossible reasons:');
    console.log('  • Sonic ROM may need different input sequence');
    console.log('  • Game may need to progress past title screens');
    console.log('  • Music may trigger at specific game events');
    console.log('  • ROM may be sound effects only variant');
  } else {
    console.log('\n❌ No PSG activity detected - hardware issue');
  }
};

DEBUG_SONIC_COMPREHENSIVE().catch(console.error);