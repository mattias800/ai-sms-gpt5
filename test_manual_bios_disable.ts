import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Test if manually disabling BIOS enables PSG audio
const testManualBiosDisable = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  console.log('Testing manual BIOS disable to unlock audio...\n');

  // Test 1: Normal BIOS mode (current behavior)
  console.log('=== TEST 1: With BIOS Active (Current Behavior) ===');
  const m1 = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });

  const dataBytes1 = await runAndCountDataBytes(m1, 8, 'BIOS Active');

  // Test 2: Manually disable BIOS at startup
  console.log('\n=== TEST 2: Manual BIOS Disable at 3s ===');
  const m2 = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });

  const dataBytes2 = await runWithManualBiosDisable(m2, 10, 3); // Disable at 3s

  // Test 3: BIOS disabled from start (useManualInit: true)
  console.log('\n=== TEST 3: No BIOS From Start ===');
  const m3 = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: true // This should skip BIOS entirely
  });

  const dataBytes3 = await runAndCountDataBytes(m3, 8, 'No BIOS');

  // Results
  console.log('\n=== RESULTS COMPARISON ===');
  console.log(`BIOS Active:       ${dataBytes1} PSG data bytes`);
  console.log(`Manual BIOS Disable: ${dataBytes2} PSG data bytes`);
  console.log(`No BIOS From Start: ${dataBytes3} PSG data bytes`);

  if (dataBytes2 > dataBytes1 || dataBytes3 > dataBytes1) {
    console.log('\n✅ BREAKTHROUGH: BIOS disable enables PSG audio!');
    console.log('Root cause: Games require BIOS to be disabled for audio initialization');
  } else {
    console.log('\n❌ BIOS disable alone does not fix audio issue');
    console.log('The problem lies elsewhere in the emulation');
  }
};

async function runAndCountDataBytes(machine: any, seconds: number, label: string): Promise<number> {
  const psg = machine.getPSG();
  let dataByteCount = 0;

  const originalWrite = psg.write;
  psg.write = (val: number) => {
    if (!(val & 0x80)) { // Data byte
      dataByteCount++;
      console.log(`${label}: PSG data byte #${dataByteCount} = 0x${val.toString(16)}`);
    }
    return originalWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  const cpu = machine.getCPU();
  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`${label}: Completed ${seconds}s, ${dataByteCount} PSG data bytes detected`);
  return dataByteCount;
}

async function runWithManualBiosDisable(machine: any, totalSeconds: number, disableAtSecond: number): Promise<number> {
  const psg = machine.getPSG();
  const bus = machine.getBus();
  let dataByteCount = 0;
  let biosDisabled = false;

  const originalWrite = psg.write;
  psg.write = (val: number) => {
    if (!(val & 0x80)) { // Data byte
      dataByteCount++;
      const status = biosDisabled ? '(post-BIOS-disable)' : '(pre-BIOS-disable)';
      console.log(`Manual Disable: PSG data byte #${dataByteCount} = 0x${val.toString(16)} ${status}`);
    }
    return originalWrite(val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const cyclesToRun = CPU_CLOCK_HZ * totalSeconds;
  const disableCycle = CPU_CLOCK_HZ * disableAtSecond;
  let cyclesExecuted = 0;

  const cpu = machine.getCPU();
  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    // Manually disable BIOS at specified time
    if (!biosDisabled && cyclesExecuted >= disableCycle) {
      console.log(`\n🔧 ${disableAtSecond}s: Manually disabling BIOS via bus.writeIO8(0x3E, 0x04)`);
      (bus as any).writeIO8(0x3E, 0x04); // Disable BIOS
      biosDisabled = true;
      console.log(`BIOS state after disable: ${(bus as any).biosEnabled ? 'STILL ENABLED' : 'DISABLED'}`);
    }
  }

  console.log(`Manual Disable: Completed ${totalSeconds}s, ${dataByteCount} PSG data bytes detected`);
  return dataByteCount;
}

testManualBiosDisable().catch(console.error);