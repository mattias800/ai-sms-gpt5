import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

// Debug complete hardware state when games should be playing music
const debugHardwareState = async () => {
  const bios = new Uint8Array((await fs.readFile('third_party/mame/roms/sms1/mpr-10052.rom')).buffer);
  const rom = new Uint8Array((await fs.readFile('sonic.sms')).buffer);

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false
  });
  const cpu = m.getCPU();
  const bus = m.getBus();
  const vdp = m.getVDP();
  const psg = m.getPSG();

  // Track all I/O register writes
  const ioWrites: Array<{time: number, port: number, value: number}> = [];
  const originalWriteIO8 = (bus as any).writeIO8;

  (bus as any).writeIO8 = function(port: number, val: number) {
    ioWrites.push({
      time: ioWrites.length * 0.0001,
      port: port,
      value: val
    });
    return originalWriteIO8.call(this, port, val);
  };

  const CPU_CLOCK_HZ = 3_579_545;
  const seconds = 10; // Run until music should be active
  const cyclesToRun = CPU_CLOCK_HZ * seconds;
  let cyclesExecuted = 0;

  console.log('Analyzing complete hardware state when music should be playing...');

  const startTime = Date.now();

  while (cyclesExecuted < cyclesToRun) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    // Check at 5 seconds - music should be active by now in working emulators
    if (Math.floor(cyclesExecuted / CPU_CLOCK_HZ) === 5) {
      console.log('\n=== HARDWARE STATE AT 5 SECONDS (MUSIC SHOULD BE ACTIVE) ===');

      // 1. CPU State
      const cpuDebug = m.getDebugStats();
      console.log('CPU State:');
      console.log(`  PC: 0x${cpuDebug.pc.toString(16).padStart(4, '0')}`);
      console.log(`  Interrupts: IFF1=${cpuDebug.iff1} IFF2=${cpuDebug.iff2} IM=${cpuDebug.im}`);
      console.log(`  Halted: ${cpuDebug.halted}`);
      console.log(`  IRQ Accepted Count: ${cpuDebug.irqAccepted}`);

      // 2. Bus Control State
      console.log('\nBus Control State:');
      console.log(`  Memory Control (0x3E): 0x${(bus as any).memControl?.toString(16) || '??'}`);
      console.log(`  I/O Control (0x3F): 0x${(bus as any).ioControl?.toString(16) || '??'}`);
      console.log(`  BIOS Enabled: ${(bus as any).biosEnabled}`);
      console.log(`  Cart RAM Enabled: ${(bus as any).cartRamEnabled}`);

      // 3. VDP State (might affect audio timing)
      const vdpState = vdp.getState();
      console.log('\nVDP State:');
      console.log(`  Display Enabled: ${vdpState.regs[1] & 0x40 ? 'YES' : 'NO'}`);
      console.log(`  Interrupts Enabled: ${vdpState.regs[1] & 0x20 ? 'YES' : 'NO'}`);
      console.log(`  Mode: ${vdpState.regs[0] & 0x06 ? 'Graphics' : 'Text'}`);
      console.log(`  Frame Counter: ${vdpState.frameCounter}`);

      // 4. PSG State
      const psgState = psg.getState();
      console.log('\nPSG State:');
      console.log(`  Tones: [${psgState.tones.join(', ')}]`);
      console.log(`  Volumes: [${psgState.vols.join(', ')}]`);
      console.log(`  LFSR: 0x${psgState.lfsr?.toString(16) || 'N/A'}`);

      // 5. Recent I/O Activity Analysis
      const recentIO = ioWrites.slice(-100); // Last 100 I/O operations
      const ioPortCounts: Record<string, number> = {};
      recentIO.forEach(io => {
        const key = `0x${io.port.toString(16)}`;
        ioPortCounts[key] = (ioPortCounts[key] || 0) + 1;
      });

      console.log('\nRecent I/O Activity (last 100 operations):');
      Object.entries(ioPortCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .forEach(([port, count]) => {
          console.log(`  ${port}: ${count} writes`);
        });

      // 6. Check for potential issues
      console.log('\n=== POTENTIAL ISSUES ===');

      if (cpuDebug.halted) {
        console.log('❌ CPU is HALTED - this could prevent music code execution');
      }

      if (!cpuDebug.iff1) {
        console.log('⚠️  CPU interrupts disabled - might affect timing-dependent audio');
      }

      if (!(vdpState.regs[1] & 0x40)) {
        console.log('⚠️  VDP display disabled - some games tie audio to display state');
      }

      if (!(vdpState.regs[1] & 0x20)) {
        console.log('⚠️  VDP interrupts disabled - music often runs in interrupt handlers');
      }

      if (psgState.tones.every(t => t === 0)) {
        console.log('❌ All PSG tones are 0 - no frequency data written');
      }

      if (psgState.vols.every(v => v === 15)) {
        console.log('❌ All PSG channels muted (volume=15)');
      }

      // 7. Compare against expected working state
      console.log('\n=== EXPECTED VS ACTUAL ===');
      console.log('Expected for working music:');
      console.log('  • CPU executing (not halted)');
      console.log('  • VDP display and interrupts enabled');
      console.log('  • PSG receiving data bytes (frequency > 0)');
      console.log('  • PSG channels with audible volumes (< 15)');
      console.log('  • Regular interrupt-driven execution');

      break; // Stop after analysis
    }

    // Progress dots
    if (cyclesExecuted % (CPU_CLOCK_HZ) === 0) {
      process.stdout.write('.');
    }
  }

  console.log(`\n\nCompleted analysis: ${Date.now() - startTime}ms real time`);
  console.log(`Total I/O operations: ${ioWrites.length}`);

  // Final recommendation
  console.log('\n=== RECOMMENDATIONS ===');
  console.log('To identify the missing piece:');
  console.log('1. Compare this state dump against a working SMS emulator');
  console.log('2. Check if VDP interrupt timing affects audio initialization');
  console.log('3. Verify if games expect specific hardware initialization sequence');
  console.log('4. Test if PSG data writing depends on other hardware states');
};

debugHardwareState().catch(console.error);