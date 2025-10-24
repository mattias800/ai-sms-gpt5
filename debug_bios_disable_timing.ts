import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Debug when/if games disable BIOS and how this affects PSG writes
const debugBiosDisableTiming = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const bus = m.getBus();
  const psg = m.getPSG();

  // Track memory control writes and PSG data bytes
  const originalWriteIO8 = (bus as any).writeIO8;
  let psgDataByteCount = 0;
  let memControlWrites: Array<{time: number, value: number}> = [];
  let biosDisableTime: number | null = null;

  (bus as any).writeIO8 = function(port: number, val: number) {
    const seconds = memControlWrites.length * 0.0001;

    // Track memory control register writes (0x3E)
    if (port === 0x3E) {
      memControlWrites.push({time: seconds, value: val});

      // Check if BIOS disable bit is set (bit 2)
      if ((val & 0x04) !== 0 && biosDisableTime === null) {
        biosDisableTime = seconds;
        console.log(`\n🔧 ${seconds.toFixed(1)}s: GAME DISABLES BIOS (0x3E = 0x${val.toString(16)})`);
        console.log('This could be the key moment for audio initialization!');
      }
    }

    return originalWriteIO8.call(this, port, val);
  };

  // Track PSG data bytes with timestamps
  const originalPSGWrite = psg.write;
  psg.write = (val: number) => {
    const seconds = psgDataByteCount * 0.0001;

    if (!(val & 0x80)) {
      // Data byte detected!
      psgDataByteCount++;
      const timeSinceBiosDisable = biosDisableTime ? seconds - biosDisableTime : null;

      console.log(`\n🎵 ${seconds.toFixed(1)}s: PSG DATA BYTE=0x${val.toString(16)} (${psgDataByteCount})`);
      if (timeSinceBiosDisable !== null) {
        console.log(`   ↳ ${timeSinceBiosDisable.toFixed(1)}s after BIOS disable`);
      } else {
        console.log(`   ↳ BIOS still active!`);
      }
    }

    return originalPSGWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 15; // Long enough to see the pattern
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Analyzing BIOS disable timing vs PSG data byte writes...');
  console.log('Theory: Games must disable BIOS before enabling audio\n');

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    // Progress updates
    if (cyclesExecuted % (CPU_CLOCK_HZ * 3) === 0) {
      const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;
      const biosStillActive = (bus as any).biosEnabled;
      console.log(`\n--- ${emulatedSec}s Progress ---`);
      console.log(`BIOS: ${biosStillActive ? '🟢 ACTIVE' : '❌ DISABLED'}`);
      console.log(`PSG Data Bytes: ${psgDataByteCount}`);
      console.log(`Memory Control Writes: ${memControlWrites.length}`);

      if (psgDataByteCount > 0) {
        console.log('\n✅ SUCCESS: PSG data bytes detected!');
        break;
      }
    }
  }

  console.log(`\nCompleted: ${Date.now() - startTime}ms real time`);

  // Final Analysis
  console.log('\n=== FINAL ANALYSIS ===');
  console.log(`Memory Control (0x3E) writes: ${memControlWrites.length}`);
  console.log(`BIOS disable time: ${biosDisableTime ? biosDisableTime.toFixed(1) + 's' : 'NEVER'}`);
  console.log(`PSG data bytes: ${psgDataByteCount}`);
  console.log(`Final BIOS state: ${(bus as any).biosEnabled ? 'ENABLED' : 'DISABLED'}`);

  if (memControlWrites.length === 0) {
    console.log('\n❌ CRITICAL: Game never writes to Memory Control register (0x3E)!');
    console.log('Working SMS games should disable BIOS via: OUT (0x3E), 0x04');
    console.log('This could be the root cause - games may refuse to init audio while BIOS active');
  } else if (biosDisableTime === null) {
    console.log('\n⚠️  Game writes to 0x3E but never sets BIOS disable bit');
    console.log('Memory control values:', memControlWrites.map(w => `0x${w.value.toString(16)}`).join(', '));
  } else if (psgDataByteCount === 0) {
    console.log('\n❌ Game disables BIOS but still no PSG data bytes');
    console.log('BIOS disable alone is not sufficient for audio');
  } else {
    console.log('\n✅ SUCCESS: BIOS disable -> PSG audio chain working!');
  }

  // Recommendations
  console.log('\n=== NEXT STEPS ===');
  if (memControlWrites.length === 0) {
    console.log('1. Check why games never write Memory Control register');
    console.log('2. Verify if BIOS->game handoff is working correctly');
    console.log('3. Compare with working emulator BIOS initialization');
  } else {
    console.log('1. Analyze Memory Control write patterns');
    console.log('2. Check if other hardware state prevents audio after BIOS disable');
    console.log('3. Test manual BIOS disable to isolate the issue');
  }
};

debugBiosDisableTiming().catch(console.error);