import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Comprehensive I/O trace: Z80 instructions -> Bus I/O -> PSG writes
const debugFullIOTrace = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();
  const bus = m.getBus();

  // Level 1: Track Z80 CPU I/O write calls
  const originalWriteIO8 = (bus as any).writeIO8;
  let cpuIOWriteCount = 0;
  let cpuPsgPortCount = 0;

  (bus as any).writeIO8 = function(port: number, val: number) {
    cpuIOWriteCount++;
    const seconds = cpuIOWriteCount * 0.0001;

    const isPsgPort = (
      port === 0x7f ||
      port === 0x7d ||
      ((port & 0x01) === 0x01 && port !== 0xbf && port !== 0xf1 && port !== 0x3f)
    );

    if (isPsgPort) {
      cpuPsgPortCount++;
      console.log(`${seconds.toFixed(1)}s: Z80->BUS OUT(0x${port.toString(16)}) = 0x${val.toString(16)}`);
    }

    return originalWriteIO8.call(this, port, val);
  };

  // Level 2: Track PSG writes (final destination)
  const originalPSGWrite = psg.write;
  let psgWriteCount = 0;
  let psgDataByteCount = 0;

  psg.write = (val: number) => {
    psgWriteCount++;
    const seconds = psgWriteCount * 0.0001;

    if (!(val & 0x80)) {
      // Data byte
      psgDataByteCount++;
      console.log(`${seconds.toFixed(1)}s: PSG DATA BYTE=0x${val.toString(16)} (count: ${psgDataByteCount}) 🎵`);
    }

    return originalPSGWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 5; // Short run to see pattern
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Full I/O trace: Z80 instructions -> Bus I/O -> PSG writes');

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    // Progress update every second
    if (cyclesExecuted % CPU_CLOCK_HZ === 0) {
      const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;
      console.log(`\n=== ${emulatedSec}s ===`);
      console.log(`Z80 I/O writes: ${cpuIOWriteCount} (PSG ports: ${cpuPsgPortCount})`);
      console.log(`PSG writes: ${psgWriteCount} (data bytes: ${psgDataByteCount})`);

      if (psgDataByteCount > 0) {
        console.log('🎵 SUCCESS: Found PSG data bytes - music system working!');
        break;
      }
    }
  }

  console.log(`\nCompleted: ${Date.now() - startTime}ms real time`);
  console.log(`\nFinal Summary:`);
  console.log(`  Z80 I/O writes: ${cpuIOWriteCount}`);
  console.log(`  Z80 PSG port writes: ${cpuPsgPortCount}`);
  console.log(`  PSG total writes: ${psgWriteCount}`);
  console.log(`  PSG data bytes: ${psgDataByteCount}`);

  // Analysis
  if (cpuIOWriteCount === 0) {
    console.log('\n❌ CRITICAL: Z80 CPU never executes OUT instructions!');
    console.log('This suggests either:');
    console.log('  1. Game uses alternative I/O method');
    console.log('  2. Z80 instruction execution issue');
    console.log('  3. Game is stuck in loop and never reaches audio code');
  } else if (cpuPsgPortCount === 0) {
    console.log('\n❌ Z80 executes OUT instructions but never to PSG ports');
  } else if (psgWriteCount === 0) {
    console.log('\n❌ Z80 writes to PSG ports but PSG never receives them');
  } else if (psgDataByteCount === 0) {
    console.log('\n❌ PSG receives writes but no data bytes (frequency issue)');
  } else {
    console.log('\n✅ Complete I/O chain working - music system functional');
  }

  // Where are the PSG writes coming from if not I/O?
  if (psgWriteCount > 0 && cpuPsgPortCount === 0) {
    console.log(`\n🔍 Mystery: PSG received ${psgWriteCount} writes with 0 I/O writes`);
    console.log('These must be from initialization or alternative pathway');
  }
};

debugFullIOTrace().catch(console.error);