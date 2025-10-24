import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Check if Sonic unmutes audio after button1 press
 */

const main = async () => {
  console.log('=== SONIC BUTTON1 PRESS & AUDIO UNMUTE TRACE ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms').catch(() => { throw new Error('sonic.sms not found'); })).buffer);
  const biosPath = './third_party/mame/roms/sms1/mpr-10052.rom';
  let bios: Uint8Array | undefined;
  try {
    bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
    console.log('Using BIOS for proper initialization');
  } catch {
    console.log('Warning: BIOS not found, running without BIOS');
  }

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: !bios,
  });
  const cpu = m.getCPU();
  const bus = m.getBus();
  const controller1 = m.getController1();

  // Track all PSG writes including timing
  const psgWrites: any[] = [];
  const inputReads: any[] = [];
  let buttonPressFrame = 0;
  let pressedBefore = false;

  const originalWrite = bus.writeIO8.bind(bus);
  const originalRead = bus.readIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const cycleCount = state.cycleCount || 0;
      const frame = Math.floor((cycleCount / (228 * 262)) % 10000);
      const v = val & 0xff;

      if (v & 0x80 && (v & 0x10)) {
        // Volume command
        const ch = (v >> 5) & 0x03;
        const vol = v & 0x0f;
        psgWrites.push({
          type: 'VOL',
          frame,
          ch,
          vol,
          muted: vol === 15,
          pc: state.pc & 0xffff,
        });
      }
    }
    return originalWrite(port, val);
  };

  bus.readIO8 = (port: number) => {
    const val = originalRead(port);
    const p = port & 0xff;
    if (p === 0xc0 || p === 0xc1) {
      const state = cpu.getState();
      const cycleCount = state.cycleCount || 0;
      const frame = Math.floor((cycleCount / (228 * 262)) % 10000);
      inputReads.push({
        frame,
        port: p,
        val: val & 0xff,
        pc: state.pc & 0xffff,
      });
    }
    return val;
  };

  // Run with button press simulation
  const FRAME_CYCLES = 228 * 262;
  const targetFrames = 20;
  let cyclesExecuted = 0;

  console.log('Running 20 frames with Button1 press at frame 5...\n');

  let frame = 0;
  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const newFrame = Math.floor(cyclesExecuted / FRAME_CYCLES);
    if (newFrame !== frame) {
      frame = newFrame;

      // Simulate button1 press at frame 5
      if (frame === 5 && !pressedBefore) {
        console.log(`[Frame ${frame}] BUTTON1 PRESS`);
        controller1!.setState({ button1: true });
        pressedBefore = true;
        buttonPressFrame = frame;
      }
      // Release at frame 6
      if (frame === 6 && pressedBefore) {
        console.log(`[Frame ${frame}] BUTTON1 RELEASE`);
        controller1!.setState({ button1: false });
      }
    }
  }

  console.log('\n=== ANALYSIS ===\n');

  // Show all PSG volume writes
  console.log('PSG Volume writes:');
  for (const w of psgWrites) {
    const after = w.frame >= buttonPressFrame ? ' (AFTER PRESS)' : '';
    console.log(`  Frame ${w.frame}: CH${w.ch} VOL=${w.vol} ${w.muted ? 'MUTED' : 'AUDIBLE'}${after}`);
  }

  // Check for unmutes after button press
  const unmutesAfterPress = psgWrites.filter(w => w.frame >= buttonPressFrame && w.vol < 15);
  const mutedAfterPress = psgWrites.filter(w => w.frame >= buttonPressFrame && w.vol === 15);

  console.log(`\nBefore button press: ${psgWrites.filter(w => w.frame < buttonPressFrame).length} writes`);
  console.log(`After button press: ${psgWrites.filter(w => w.frame >= buttonPressFrame).length} writes`);
  console.log(`  - Unmutes (vol<15): ${unmutesAfterPress.length}`);
  console.log(`  - Mutes (vol=15): ${mutedAfterPress.length}`);

  console.log(`\nInput reads: ${inputReads.length}`);
  if (inputReads.length > 0) {
    console.log('First 10 input reads:');
    for (const r of inputReads.slice(0, 10)) {
      const button1 = (r.val & 0x10) === 0 ? 'DOWN' : 'UP';
      console.log(`  Frame ${r.frame}: port 0x${r.port.toString(16)} = 0x${r.val.toString(16).padStart(2, '0')} (Button1=${button1}) @ PC=0x${r.pc.toString(16).padStart(4, '0')}`);
    }
  }

  if (unmutesAfterPress.length === 0) {
    console.log('\n❌ ISSUE: No audio unmute after Button1 press!');
    console.log('Possible causes:');
    console.log('1. Sonic code never reads the controller input');
    console.log('2. Sonic reads input but unmute code not executed');
    console.log('3. Input is read but not properly gating audio driver');
  } else {
    console.log(`\n✅ Audio unmutes ${unmutesAfterPress.length} times after button press!`);
  }
};

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
