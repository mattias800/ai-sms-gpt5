import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Debug BIOS auto-disable timing and immediate PSG response
const debugBiosAutoDisable = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const bus = m.getBus();
  const psg = m.getPSG();

  // Track BIOS state and PSG activity
  let psgDataByteCount = 0;
  let biosWasEnabled = true;
  let biosDisableTime: number | null = null;

  // Override PSG write to detect data bytes
  const originalPSGWrite = psg.write;
  psg.write = (val: number) => {
    if (!(val & 0x80)) {
      psgDataByteCount++;
      const seconds = psgDataByteCount * 0.0001;

      if (biosDisableTime !== null) {
        const deltaTime = seconds - biosDisableTime;
        console.log(`PSG DATA #${psgDataByteCount}: 0x${val.toString(16)} (${deltaTime.toFixed(1)}s after BIOS disable)`);
      } else {
        console.log(`PSG DATA #${psgDataByteCount}: 0x${val.toString(16)} (BIOS still active!)`);
      }
    }
    return originalPSGWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 8; // Should be enough to see BIOS disable at 3 seconds
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Monitoring BIOS auto-disable and PSG response...');
  console.log('Expected: BIOS should disable at ~3 seconds (180 frames)\n');

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const chunkSize = 100000; // Run in chunks
    m.runCycles(chunkSize);
    cyclesExecuted += chunkSize;

    const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;

    // Check BIOS state every 0.5 seconds
    if (Math.floor(emulatedSec * 2) !== Math.floor((cyclesExecuted - chunkSize) / CPU_CLOCK_HZ * 2)) {
      const biosStillEnabled = (bus as any).biosEnabled;

      if (biosWasEnabled && !biosStillEnabled && biosDisableTime === null) {
        biosDisableTime = emulatedSec;
        console.log(`\n🔧 ${emulatedSec.toFixed(1)}s: BIOS AUTO-DISABLED! (${(cyclesExecuted / 60000).toFixed(0)} frames)`);
        console.log('Game should now initialize audio...\n');
      }

      // Progress update
      if (Math.floor(emulatedSec) !== Math.floor((cyclesExecuted - chunkSize) / CPU_CLOCK_HZ)) {
        console.log(`${emulatedSec.toFixed(0)}s: BIOS=${biosStillEnabled ? 'ACTIVE' : 'DISABLED'}, PSG data bytes=${psgDataByteCount}`);
      }

      biosWasEnabled = biosStillEnabled;
    }
  }

  console.log(`\nCompleted: ${Date.now() - startTime}ms real time`);
  console.log(`BIOS disable time: ${biosDisableTime ? biosDisableTime.toFixed(1) + 's' : 'NEVER'}`);
  console.log(`PSG data bytes: ${psgDataByteCount}`);

  if (biosDisableTime === null) {
    console.log('\n❌ CRITICAL: BIOS never auto-disabled!');
    console.log('This means the fix did not work - check the timing calculation');
  } else if (psgDataByteCount === 0) {
    console.log('\n❌ BIOS disabled but no PSG data bytes detected');
    console.log('Games may need longer to initialize audio after BIOS disable');
  } else {
    console.log('\n✅ SUCCESS: BIOS auto-disable -> PSG data bytes detected!');
    console.log('The audio initialization sequence is working');
  }
};

debugBiosAutoDisable().catch(console.error);