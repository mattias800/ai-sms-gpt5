import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Debug both bus layer I/O and PSG layer to find where data bytes are lost
const debugPSGBusLayer = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const psg = m.getPSG();
  const bus = m.getBus(); // Access bus for debugging

  // Track I/O operations at bus level
  const originalIOWrite = bus.ioWrite;
  let ioWriteCount = 0;
  let psgPortWrites = 0;

  bus.ioWrite = (port: number, val: number) => {
    ioWriteCount++;
    const seconds = ioWriteCount * 0.0001;

    // PSG port range check (matching bus logic)
    const isPsgPort = (
      port === 0x7f ||
      port === 0x7d ||
      ((port & 0x01) === 0x01 && port !== 0xbf && port !== 0xf1 && port !== 0x3f)
    );

    if (isPsgPort) {
      psgPortWrites++;

      if (val & 0x80) {
        // Latch byte
        const channel = (val >>> 5) & 0x03;
        const isVolume = (val & 0x10) !== 0;
        const data = val & 0x0f;

        if (isVolume) {
          console.log(`${seconds.toFixed(1)}s: BUS->PSG port=0x${port.toString(16)} VOLUME Ch${channel}=${data} val=0x${val.toString(16)}`);
        } else if (channel < 3) {
          console.log(`${seconds.toFixed(1)}s: BUS->PSG port=0x${port.toString(16)} TONE Ch${channel} low=${data} val=0x${val.toString(16)}`);
        } else {
          console.log(`${seconds.toFixed(1)}s: BUS->PSG port=0x${port.toString(16)} NOISE mode=${data} val=0x${val.toString(16)}`);
        }
      } else {
        // Data byte
        const data = val & 0x3f;
        console.log(`${seconds.toFixed(1)}s: BUS->PSG port=0x${port.toString(16)} 🎵 DATA=${data} val=0x${val.toString(16)}`);
      }
    }

    // Call original
    return originalIOWrite.call(bus, port, val);
  };

  // Track PSG writes (should match bus layer)
  const originalPSGWrite = psg.write;
  let psgWriteCount = 0;

  psg.write = (val: number) => {
    psgWriteCount++;
    const seconds = psgWriteCount * 0.0001;

    if (!(val & 0x80)) {
      // This should be a data byte - if we see this, PSG is getting data bytes
      const data = val & 0x3f;
      console.log(`${seconds.toFixed(1)}s: PSG RECEIVED DATA=${data} val=0x${val.toString(16)} ✅`);
    }

    return originalPSGWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 10;
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Debugging PSG writes at both bus and PSG layer...');

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    // Progress update every 2 seconds
    if (cyclesExecuted % (CPU_CLOCK_HZ * 2) === 0) {
      const emulatedSec = cyclesExecuted / CPU_CLOCK_HZ;
      console.log(`\n=== ${emulatedSec.toFixed(0)}s ===`);
      console.log(`Total I/O writes: ${ioWriteCount}, PSG port writes: ${psgPortWrites}, PSG writes received: ${psgWriteCount}`);

      if (psgPortWrites !== psgWriteCount) {
        console.log(`❌ MISMATCH: Bus PSG writes (${psgPortWrites}) != PSG writes received (${psgWriteCount})`);
      }
    }
  }

  console.log(`\nCompleted: ${Date.now() - startTime}ms real time`);
  console.log(`Total I/O writes: ${ioWriteCount}`);
  console.log(`PSG port writes (bus layer): ${psgPortWrites}`);
  console.log(`PSG writes received (PSG layer): ${psgWriteCount}`);

  if (psgPortWrites === psgWriteCount) {
    console.log('✅ Bus and PSG layers are synchronized');
  } else {
    console.log('❌ Bus and PSG layers are NOT synchronized - PSG not receiving all writes');
  }

  const finalState = psg.getState();
  console.log(`\nFinal PSG State:`);
  console.log(`  Tones: [${finalState.tones.join(', ')}]`);
  console.log(`  Volumes: [${finalState.vols.join(', ')}]`);
};

debugPSGBusLayer().catch(console.error);