import { readFileSync } from 'fs';
import { createMachine, type IMachine } from '../src/machine/machine.js';

const run = (romPath: string, frames: number): void => {
  const rom = new Uint8Array(readFileSync(romPath));
  let irqCount = 0;
  let nmiCount = 0;
  const mach: IMachine = createMachine({
    cart: { rom },
    wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
    bus: { allowCartRam: false },
    fastBlocks: true,
    trace: {
      onTrace: (ev): void => {
        if (ev.irqAccepted) irqCount++;
        if (ev.nmiAccepted) nmiCount++;
      },
      traceDisasm: false,
      traceRegs: false,
    },
  });

  const vdp = mach.getVDP();
  const st0 = vdp.getState?.();
  const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);

  for (let i = 0; i < frames; i++) mach.runCycles(cyclesPerFrame);

  console.log(`IRQ accepted: ${irqCount}, NMI accepted: ${nmiCount} over ${frames} frames`);
};

const romArgIdx = process.argv.indexOf('--rom');
const framesIdx = process.argv.indexOf('--frames');
const romPath = romArgIdx >= 0 ? process.argv[romArgIdx + 1] : (process.env.SMS_ROM || './sonic.sms');
const frames = framesIdx >= 0 ? Math.max(1, parseInt(process.argv[framesIdx + 1] || '600', 10)) : 600;

run(romPath, frames);

