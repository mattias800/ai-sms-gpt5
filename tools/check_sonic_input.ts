import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Check if Sonic's audio unmute is gated by input or other conditions
 */

const main = async () => {
  console.log('=== SONIC INPUT & GAME STATE ANALYSIS ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  const cpu = m.getCPU();
  const bus = m.getBus();

  // Track input port reads
  const inputReads: any[] = [];
  const psgWrites: any[] = [];

  const originalRead = bus.readIO8.bind(bus);
  const originalWrite = bus.writeIO8.bind(bus);

  bus.readIO8 = (port: number) => {
    const val = originalRead(port);
    const p = port & 0xff;
    // Input ports are 0xC0 (P1 input), 0xC1 (P2 input)
    if (p === 0xc0 || p === 0xc1) {
      const state = cpu.getState();
      inputReads.push({
        type: 'INPUT_READ',
        port: p,
        val: val & 0xff,
        pc: state.pc & 0xffff,
        frame: Math.floor((state.cycleCount / (228 * 262)) % 1000),
      });
    }
    return val;
  };

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const v = val & 0xff;
      if (v & 0x80 && (v & 0x10)) {
        // Volume command
        psgWrites.push({
          type: 'PSG_VOL',
          val: v & 0x0f,
          pc: state.pc & 0xffff,
          frame: Math.floor((state.cycleCount / (228 * 262)) % 1000),
        });
      }
    }
    return originalWrite(port, val);
  };

  // Run until we get some input reads or reach frame limit
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 30;

  console.log('Tracking input reads and PSG writes over 30 frames...\n');

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  console.log(`Input reads: ${inputReads.length}`);
  console.log(`PSG volume writes: ${psgWrites.length}`);

  if (inputReads.length > 0) {
    console.log('\nInput reads detected:');
    for (const r of inputReads.slice(0, 10)) {
      console.log(`  Frame ${r.frame}: READ port 0x${r.port.toString(16).padStart(2, '0')} = 0x${r.val.toString(16).padStart(2, '0')} @ PC=0x${r.pc.toString(16).padStart(4, '0')}`);
    }
  } else {
    console.log('\n⚠️  No input reads in 30 frames! Sonic may not be reading controller input.');
    console.log('This could mean:');
    console.log('1. Input code hasnt run yet (needs START press first)');
    console.log('2. Sonic skips input during title screen');
    console.log('3. Input is read from different port');
  }

  console.log('\nPSG volume writes:');
  for (const w of psgWrites) {
    const muted = w.val === 15 ? 'MUTED' : `AUDIBLE(${w.val})`;
    console.log(`  Frame ${w.frame}: VOL=0x${w.val.toString(16).padStart(2, '0')} (${muted}) @ PC=0x${w.pc.toString(16).padStart(4, '0')}`);
  }

  console.log('\n=== THEORY ===');
  if (inputReads.length === 0) {
    console.log('Sonic may be in an initialization state where it never reads input.');
    console.log('Audio unmute might be gated by: "If input_was_read_this_frame then unmute"');
    console.log('\nOtherwise, the unmute code path is just not reached.');
  }
};

main().catch(console.error);
