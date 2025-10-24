import { readFileSync } from 'fs';
import { createMachine, type IMachine } from '../src/machine/machine.js';
import { type IVDP } from '../src/vdp/vdp.js';
import { type IPSG } from '../src/psg/sn76489.js';

const run = (romPath: string, seconds: number, biosPath?: string | null): void => {
  const rom = new Uint8Array(readFileSync(romPath));
  const bios = biosPath ? new Uint8Array(readFileSync(biosPath)) : null;
  const mach: IMachine = createMachine({
    cart: { rom },
    wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
    bus: { allowCartRam: true, bios },
    fastBlocks: true,
  });
  const vdp: IVDP = mach.getVDP();
  const psg: IPSG = mach.getPSG();

  const st0 = vdp.getState?.();
  const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
  const frames = seconds * 60;

  let lastVols = psg.getState().vols.join(',');
  let changes = 0;

  for (let i = 0; i < frames; i++) {
    mach.runCycles(cyclesPerFrame);
    const volsStr = psg.getState().vols.join(',');
    if (volsStr !== lastVols) {
      changes++;
      console.log(`t=${(i+1)/60}s vols=[${volsStr}]`);
      lastVols = volsStr;
    }
  }
  console.log(`Done. Volume changes observed: ${changes}`);
};

const romArgIdx = process.argv.indexOf('--rom');
const secArgIdx = process.argv.indexOf('--seconds');
const biosArgIdx = process.argv.indexOf('--bios');
const romPath = romArgIdx >= 0 ? process.argv[romArgIdx + 1] : (process.env.SMS_ROM || './sonic.sms');
const seconds = secArgIdx >= 0 ? Math.max(1, parseInt(process.argv[secArgIdx + 1] || '5', 10)) : 5;
const biosPath = biosArgIdx >= 0 ? process.argv[biosArgIdx + 1] : (process.env.SMS_BIOS || '');

run(romPath, seconds, biosPath ? biosPath : null);

