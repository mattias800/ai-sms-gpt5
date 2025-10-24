import { createMachine } from './src/machine/machine.js';
import { promises as fs } from 'fs';

const tracePSGPortData = async () => {
  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true },
  });

  const cpu = m.getCPU();
  const bus = m.getBus();

  // Capture all I/O writes including the DATA/CONTROL distinction
  const originalWrite = bus.writeIO8.bind(bus);
  const portWrites: any[] = [];

  bus.writeIO8 = (port: number, val: number) => {
    // Track all writes to PSG ports
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff || (port & 0xfe) === 0x7e) {
      const state = cpu.getState();
      portWrites.push({
        port: port & 0xff,
        val: val & 0xff,
        pc: state.pc & 0xffff,
      });
    }
    return originalWrite(port, val);
  };

  // Run for 10 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetCycles = FRAME_CYCLES * 10;

  console.log('Tracing PSG port 0x7F I/O writes...\n');

  while (cyclesExecuted < targetCycles) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`Total PSG port writes: ${portWrites.length}\n`);
  console.log('Write analysis:\n');

  // Group by PC and analyze patterns
  const byPC: { [pc: number]: any[] } = {};
  for (const write of portWrites) {
    if (!byPC[write.pc]) byPC[write.pc] = [];
    byPC[write.pc].push(write);
  }

  for (const pc in byPC) {
    const writes = byPC[pc];
    console.log(`PC=0x${pc.padStart(4, '0')}:`);
    
    for (const w of writes.slice(0, 20)) {
      const val = w.val;
      let meaning = '';

      if (val & 0x80) {
        const channel = (val >>> 5) & 0x03;
        const isVolume = (val & 0x10) !== 0;
        const data = val & 0x0f;

        if (isVolume) {
          const volNames = ['MAX', 'Vol14', 'Vol13', 'Vol12', 'Vol11', 'Vol10', 'Vol9', 'Vol8', 'Vol7', 'Vol6', 'Vol5', 'Vol4', 'Vol3', 'Vol2', 'Vol1', 'MUTE'];
          meaning = `Volume Ch${channel}=${data} (${volNames[data]})`;
        } else {
          meaning = `Freq Ch${channel} low=${data}`;
        }
      } else {
        meaning = `Data byte: 0x${val.toString(16).padStart(2, '0')}`;
      }

      console.log(`  0x${val.toString(16).padStart(2, '0')} - ${meaning}`);
    }

    if (writes.length > 20) {
      console.log(`  ... and ${writes.length - 20} more writes from this PC`);
    }
    console.log();
  }

  // Summary
  const volumeWrites = portWrites.filter(w => w.val & 0x80 && w.val & 0x10);
  const unmutedWrites = volumeWrites.filter(w => (w.val & 0x0f) < 0xf);

  console.log('=== SUMMARY ===');
  console.log(`Total volume writes: ${volumeWrites.length}`);
  console.log(`Unmuted volume writes (vol < 0xF): ${unmutedWrites.length}`);
  
  if (unmutedWrites.length > 0) {
    console.log(`\n✅ SONIC DOES UNMUTE AUDIO!`);
    console.log('Unmuted writes:');
    for (const w of unmutedWrites) {
      const vol = w.val & 0x0f;
      const ch = (w.val >>> 5) & 0x03;
      console.log(`  PC=0x${w.pc.toString(16).padStart(4, '0')}: Ch${ch} volume=${vol}`);
    }
  } else {
    console.log(`\n❌ All volume writes keep channels muted`);
  }
};

tracePSGPortData().catch(console.error);
