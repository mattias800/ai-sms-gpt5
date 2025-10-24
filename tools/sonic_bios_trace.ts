import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace Sonic with BIOS to understand audio initialization
 */

const main = async () => {
  console.log('=== SONIC WITH BIOS - AUDIO TRACE ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const biosPath = './third_party/mame/roms/sms1/mpr-10052.rom';
  let bios: Uint8Array | undefined;
  try {
    bios = new Uint8Array((await fs.readFile(biosPath)).buffer);
  } catch {
    console.error('BIOS not found');
    process.exit(1);
  }

  const m = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    useManualInit: false, // Use BIOS
  });
  const cpu = m.getCPU();
  const bus = m.getBus();
  const controller1 = m.getController1();
  const psg = m.getPSG();

  // Track PSG state changes
  const events: any[] = [];
  let lastPsgState = psg.getState();

  const originalWrite = bus.writeIO8.bind(bus);
  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const v = val & 0xff;
      const frame = Math.floor((state.cycleCount / (228 * 262)) % 10000);

      if (v & 0x80 && (v & 0x10)) {
        // Volume command
        const ch = (v >> 5) & 0x03;
        const vol = v & 0x0f;
        events.push({
          type: 'VOL',
          frame,
          ch,
          vol,
          pc: state.pc & 0xffff,
        });
      } else if (v & 0x80) {
        // Tone frequency high
        const ch = (v >> 5) & 0x03;
        const freqHigh = v & 0x0f;
        events.push({
          type: 'TONE_HI',
          frame,
          ch,
          freqHigh,
          pc: state.pc & 0xffff,
        });
      }
    }
    return originalWrite(port, val);
  };

  // Run 20 frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 20;
  let frame = 0;
  let buttonPressedAt = -1;

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const newFrame = Math.floor(cyclesExecuted / FRAME_CYCLES);
    if (newFrame !== frame) {
      frame = newFrame;

      // Simulate button press at frame 5
      if (frame === 5 && buttonPressedAt < 0) {
        controller1!.setState({ button1: true });
        buttonPressedAt = frame;
        console.log(`[Frame ${frame}] Button1 PRESS`);
      }
      if (frame === 6 && buttonPressedAt === 5) {
        controller1!.setState({ button1: false });
        console.log(`[Frame ${frame}] Button1 RELEASE`);
      }

      // Log PSG state
      const psgState = psg.getState();
      const vols = psgState.vols.map((v, i) => (v < 15 ? `${i}:${v}` : null)).filter(v => v);
      if (vols.length > 0 || frame < 5) {
        console.log(`[Frame ${frame}] PSG: vols=[${vols.join(',')}]`);
      }
    }
  }

  console.log('\n=== PSG WRITE EVENTS ===\n');

  // Group by frame
  const byFrame = new Map<number, any[]>();
  for (const e of events) {
    if (!byFrame.has(e.frame)) byFrame.set(e.frame, []);
    byFrame.get(e.frame)!.push(e);
  }

  // Show first 10 frames with events
  let count = 0;
  for (const [frameNum, frameEvents] of [...byFrame.entries()].sort((a, b) => a[0] - b[0])) {
    if (count++ > 10) break;
    console.log(`Frame ${frameNum}:`);
    for (const e of frameEvents) {
      if (e.type === 'VOL') {
        const audible = e.vol < 15 ? 'AUDIBLE' : 'MUTED';
        console.log(`  VOL CH${e.ch} = ${e.vol} (${audible}) @ PC=0x${e.pc.toString(16).padStart(4, '0')}`);
      } else {
        console.log(`  TONE_HI CH${e.ch} = ${e.freqHigh} @ PC=0x${e.pc.toString(16).padStart(4, '0')}`);
      }
    }
  }

  // Analyze unmutes
  const volWrites = events.filter(e => e.type === 'VOL');
  const unmutes = volWrites.filter(e => e.vol < 15);
  const mutes = volWrites.filter(e => e.vol === 15);

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total volume writes: ${volWrites.length}`);
  console.log(`  - Unmutes (vol<15): ${unmutes.length}`);
  console.log(`  - Mutes (vol=15): ${mutes.length}`);

  if (unmutes.length === 0) {
    console.log('\n❌ No unmutes detected!');
    console.log('Despite BIOS+button press, Sonic never unmutes PSG channels.');
  } else {
    console.log('\n✅ Unmutes detected!');
    for (const u of unmutes.slice(0, 5)) {
      console.log(`  Frame ${u.frame}: CH${u.ch} VOL=${u.vol}`);
    }
  }
};

main().catch(console.error);
