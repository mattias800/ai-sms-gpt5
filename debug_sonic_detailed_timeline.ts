import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';
import path from 'path';

const DEBUG_SONIC_DETAILED_TIMELINE = async () => {
  const ROOT = process.cwd();
  const sonicPath = path.join(ROOT, 'sonic.sms');
  const biosPath = path.join(ROOT, 'third_party/mame/roms/sms1/mpr-10052.rom');

  // Check if files exist
  try {
    await fs.access(sonicPath);
  } catch {
    console.log('sonic.sms not found - cannot run detailed timeline analysis');
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

  const sampleRate = 22050;
  const seconds = 25.0; // Extended runtime to see long-term behavior
  const totalSamples = Math.floor(sampleRate * seconds);
  const CPU_CLOCK_HZ = 3_579_545;
  const cyclesPerSample = CPU_CLOCK_HZ / sampleRate;

  let carry = 0;
  let startButtonPressed = false;
  let downButtonPressed = false;
  let lastLogTime = -1;

  console.log('\n📊 Detailed Sonic PSG Timeline Analysis:');
  console.log('Time    | BIOS | Volume Activity | Tone Activity | Notes');
  console.log('--------|------|-----------------|---------------|------------------');

  for (let i = 0; i < totalSamples; i++) {
    carry += cyclesPerSample;
    let toRun = Math.floor(carry);
    carry -= toRun;

    const currentTime = i / sampleRate;

    // Controller simulation
    if (!startButtonPressed && currentTime >= 5.0) {
      console.log(`🎮 Controller: Button 1 press at ${currentTime.toFixed(1)}s`);
      controller1?.setState({ button1: true });
      startButtonPressed = true;
    }
    if (startButtonPressed && currentTime >= 5.1) {
      controller1?.setState({ button1: false });
    }

    // Additional button press to navigate menus/screens
    if (!downButtonPressed && currentTime >= 8.0) {
      console.log(`🎮 Controller: Down button press at ${currentTime.toFixed(1)}s (menu navigation)`);
      controller1?.setState({ down: true });
      downButtonPressed = true;
    }
    if (downButtonPressed && currentTime >= 8.1) {
      controller1?.setState({ down: false });
    }

    while (toRun > 0) {
      const { cycles } = cpu.stepOne();
      toRun -= cycles;
    }

    // Log PSG state every 0.5 seconds
    if (Math.floor(currentTime * 2) > lastLogTime) {
      lastLogTime = Math.floor(currentTime * 2);

      const state = psg.getState();
      const biosActive = (m as any).bus?.getBiosActive?.() ?? 'unknown';

      // Volume analysis
      const activeVols = state.vols.map((v, ch) => v < 15 ? `${ch}:${v}` : null).filter(Boolean);
      const volumeInfo = activeVols.length > 0 ? activeVols.join(',') : 'silent';

      // Tone analysis
      const activeTones = state.tones.map((t, ch) => t > 0 ? `${ch}:${t}` : null).filter(Boolean);
      const toneInfo = activeTones.length > 0 ? activeTones.join(',') : 'none';

      // Additional notes based on timing
      let notes = '';
      if (currentTime < 3.0) notes = 'BIOS init phase';
      else if (currentTime < 5.0) notes = 'Game boot/menu';
      else if (currentTime < 6.0) notes = 'Start pressed';
      else if (currentTime < 10.0) notes = 'Title/intro screens';
      else notes = 'Gameplay expected';

      console.log(`${currentTime.toFixed(1).padStart(6)}s | ${String(biosActive).padStart(4)} | ${volumeInfo.padEnd(15)} | ${toneInfo.padEnd(13)} | ${notes}`);
    }
  }

  // Final analysis summary
  console.log('\n📋 Summary:');
  const finalState = psg.getState();
  const biosActive = (m as any).bus?.getBiosActive?.() ?? 'unknown';
  console.log(`Final BIOS state: ${biosActive}`);
  console.log(`Final PSG volumes: [${finalState.vols.join(', ')}]`);
  console.log(`Final PSG tones: [${finalState.tones.join(', ')}]`);

  // Check for any tone activity throughout the run
  console.log('\n🔍 Searching for any musical activity...');

  // Quick resample to check for any tone changes during runtime
  let foundAnyTones = false;
  for (let testSample = 0; testSample < Math.min(totalSamples, 100000); testSample += 1000) {
    const testState = psg.getState();
    if (testState.tones.some(t => t > 0)) {
      foundAnyTones = true;
      console.log(`✓ Found tone activity at sample ${testSample} (~${(testSample/sampleRate).toFixed(1)}s)`);
      console.log(`  Tones: [${testState.tones.join(', ')}]`);
      break;
    }
  }

  if (!foundAnyTones) {
    console.log('❌ No musical tone activity detected throughout entire run');
    console.log('This suggests:');
    console.log('  • Game may need specific input sequence to trigger music');
    console.log('  • Game may need to progress to different screen/level');
    console.log('  • Game may use sound effects but no continuous music');
    console.log('  • Audio initialization successful but music not triggered');
  }
};

DEBUG_SONIC_DETAILED_TIMELINE().catch(console.error);