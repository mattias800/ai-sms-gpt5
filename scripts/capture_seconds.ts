import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { createMachine, type IMachine } from '../src/machine/machine.js';
import { type IVDP } from '../src/vdp/vdp.js';
import { type Cartridge } from '../src/bus/bus.js';

interface Args {
  romCli?: string;
  seconds?: number;
  outDirCli?: string;
}

interface ParsedConfig {
  romPath: string;
  seconds: number;
  outDir: string;
  romBase: string;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

const parseArgs = (argv: string[]): Args => {
  const args: Args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--rom' && i + 1 < argv.length) {
      args.romCli = argv[++i];
    } else if (a === '--seconds' && i + 1 < argv.length) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) args.seconds = Math.floor(n);
    } else if (a === '--out' && i + 1 < argv.length) {
      args.outDirCli = argv[++i];
    }
  }
  return args;
};

const resolveConfig = (args: Args): ParsedConfig => {
  const romPath = args.romCli ?? process.env.SMS_ROM ?? '';
  if (!romPath) {
    console.error('Error: ROM path not provided. Use --rom <path> or set SMS_ROM env var.');
    console.error('Example: SMS_ROM=/abs/sonic.sms npx tsx scripts/capture_seconds.ts --seconds 20');
    process.exit(1);
  }
  if (!existsSync(romPath)) {
    console.error(`Error: ROM file not found: ${romPath}`);
    process.exit(1);
  }

  const seconds = args.seconds ?? 20;
  const romBase = path.basename(romPath, path.extname(romPath));
  const outDir = args.outDirCli ?? path.join('out', `${romBase}_seconds`);
  return { romPath, seconds, outDir, romBase };
};

const ensureDir = (dir: string): void => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
};

const rgbToPngBuffer = (width: number, height: number, rgb: Uint8Array): Buffer => {
  const png = new PNG({ width, height });
  const rgba = png.data;
  const pixels = width * height;
  for (let i = 0; i < pixels; i++) {
    const src = i * 3;
    const dst = i * 4;
    rgba[dst] = rgb[src] ?? 0;
    rgba[dst + 1] = rgb[src + 1] ?? 0;
    rgba[dst + 2] = rgb[src + 2] ?? 0;
    rgba[dst + 3] = 255;
  }
  return PNG.sync.write(png);
};

const computeCyclesPerFrame = (vdp: IVDP): number => {
  const st = vdp.getState ? vdp.getState() : undefined;
  const cpl = st?.cyclesPerLine ?? 228;
  const lpf = st?.linesPerFrame ?? 262;
  return (cpl | 0) * (lpf | 0);
};

const main = (): void => {
  const cfg = resolveConfig(parseArgs(process.argv));
  ensureDir(cfg.outDir);

  const romU8 = new Uint8Array(readFileSync(cfg.romPath));
  const cart: Cartridge = { rom: romU8 };

  const machine: IMachine = createMachine({
    cart,
    wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
    bus: { allowCartRam: false },
    fastBlocks: true,
  });

  const vdp = machine.getVDP() as IVDP;
  const cyclesPerFrame = computeCyclesPerFrame(vdp);
  const totalFrames = cfg.seconds * 60;

  console.log(`Running ${cfg.romPath} for ${cfg.seconds} seconds (${totalFrames} frames)...`);

  for (let frame = 0; frame < totalFrames; frame++) {
    machine.runCycles(cyclesPerFrame);

    if ((frame + 1) % 60 === 0) {
      const second = Math.floor((frame + 1) / 60);
      if (!vdp.renderFrame) {
        console.error('VDP.renderFrame() not available');
        process.exit(1);
      }
      const rgb = vdp.renderFrame();
      if (rgb.length !== 256 * 192 * 3) {
        console.error(`Unexpected frame buffer size: ${rgb.length}`);
        process.exit(1);
      }
      const png = rgbToPngBuffer(256, 192, rgb);
      const outPath = path.join(cfg.outDir, `${cfg.romBase}_${pad2(second)}s.png`);
      writeFileSync(outPath, png);
      console.log(`captured t=${pad2(second)}s -> ${outPath}`);
    }
  }

  console.log('Done.');
};

main();

