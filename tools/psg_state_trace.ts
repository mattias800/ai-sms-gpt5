import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Trace PSG internal state to understand volume behavior
 */

const main = async () => {
  console.log('=== PSG STATE TRACE ===\n');

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
    useManualInit: false,
  });
  const psg = m.getPSG();
  const cpu = m.getCPU();

  // Run 10 frames and log PSG state periodically
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 10;
  let frame = 0;
  let lastPsgLog = -1;

  console.log('Frame | Ch0Vol | Ch1Vol | Ch2Vol | Ch3Vol | Ch0Tone | Ch1Tone | Ch2Tone | Ch0Out | Ch1Out | Ch2Out | Sample\n---');

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;

    const newFrame = Math.floor(cyclesExecuted / FRAME_CYCLES);
    if (newFrame !== frame) {
      frame = newFrame;

      // Log PSG state
      const state = psg.getState();
      const sample = psg.getSample();
      console.log(
        `${frame}     | ${state.vols[0]}      | ${state.vols[1]}      | ${state.vols[2]}      | ${state.vols[3]}      | ${state.tones[0].toString().padStart(5, ' ')} | ${state.tones[1].toString().padStart(5, ' ')} | ${state.tones[2].toString().padStart(5, ' ')} | ${state.outputs[0] ? 1 : 0}      | ${state.outputs[1] ? 1 : 0}      | ${state.outputs[2] ? 1 : 0}      | ${sample}`
      );
    }
  }

  console.log('\nLegend:');
  console.log('- ChXVol: volume/attenuation for channel X (0=loud, 15=silent)');
  console.log('- ChXTone: 10-bit tone frequency');
  console.log('- ChXOut: current output state (0 or 1) of tone generator');
  console.log('- Sample: the audio sample value being produced');
};

main().catch(console.error);
