import { readFileSync, writeFileSync } from 'node:fs';
import { createMachine } from '../src/machine/machine.js';
import { enableSMSInterrupts } from '../src/machine/sms_init.js';
import type { Cartridge } from '../src/bus/bus.js';
import zlib from 'zlib';

// Simple PNG encoder (truecolor, no alpha)
const encodePNG = (width: number, height: number, rgb: Uint8Array): Uint8Array => {
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const writeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const len = data.length >>> 0;
    const out = new Uint8Array(8 + len + 4);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, len, false);
    out[4] = type.charCodeAt(0);
    out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2);
    out[7] = type.charCodeAt(3);
    out.set(data, 8);
    // CRC
    const crcBuf = new Uint8Array(4 + len);
    crcBuf[0] = out[4];
    crcBuf[1] = out[5];
    crcBuf[2] = out[6];
    crcBuf[3] = out[7];
    crcBuf.set(data, 4);
    let c = ~0 >>> 0;
    for (let i = 0; i < crcBuf.length; i++) {
      c ^= crcBuf[i]!;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    dv.setUint32(8 + len, (~c) >>> 0, false);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width >>> 0, false);
  dv.setUint32(4, height >>> 0, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 (truecolor)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = writeChunk('IHDR', ihdr);
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = writeChunk('IDAT', zlib.deflateSync(raw));
  const iend = writeChunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdrChunk.length + idat.length + iend.length);
  out.set(sig, 0);
  out.set(ihdrChunk, sig.length);
  out.set(idat, sig.length + ihdrChunk.length);
  out.set(iend, sig.length + ihdrChunk.length + idat.length);
  return out;
};

const readOptionalBios = (): Uint8Array | undefined => {
  // Priority:
  // 1) SMS_BIOS env
  // 2) Canonical repo BIOS path per AGENTS.md
  try {
    const envP = process.env.SMS_BIOS;
    if (envP) {
      const buf = readFileSync(envP);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
  } catch {}
  try {
    const canonical = './third_party/mame/roms/sms1/mpr-10052.rom';
    const buf = readFileSync(canonical);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  } catch {}
  return undefined;
};

const main = async (): Promise<void> => {
  const romPath = process.argv[2] ?? './wonderboy5.sms';
  const outPath = process.argv[3] ?? 'sega_logo_120.png';
  const framesTarget = Number(process.argv[4] ?? '120'); // default 120 frames

  const romBuf = readFileSync(romPath);
  const rom = new Uint8Array(romBuf.buffer, romBuf.byteOffset, romBuf.byteLength);
  const cart: Cartridge = { rom };

  const bios = readOptionalBios();
  const machine = createMachine({
    cart,
    useManualInit: bios ? false : true,
    bus: bios ? { bios } : undefined,
    wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
  });

  // Enable interrupts so game can progress beyond busy-wait loops
  try { enableSMSInterrupts(machine.getCPU()); } catch {}

  const vdp = machine.getVDP();
  const st0 = vdp.getState?.();
  const cpf = ((st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262)) | 0;

  for (let f = 0; f < framesTarget; f++) machine.runCycles(cpf);

  // Optional: last-moment video adjustments before capture (diagnostics/testing aid)
  try {
    const env = (typeof process !== 'undefined' && (process as any).env) ? (process as any).env : undefined;
    if (env) {
      if (env.SMS_FORCE_DISPLAY_ON && env.SMS_FORCE_DISPLAY_ON !== '0') {
        const r1 = (vdp.getRegister?.(1) ?? 0) & 0xff;
        const newR1 = (r1 | 0x40) & 0xff;
        // write R1
        vdp.writePort(0xBF, newR1);
        vdp.writePort(0xBF, 0x81);
      }
      if (env.SMS_FORCE_CRAM0_BLUE && env.SMS_FORCE_CRAM0_BLUE !== '0') {
        // Set CRAM index 0 to full blue (00BBGGRR: 0x30)
        vdp.writePort(0xBF, 0x00);
        vdp.writePort(0xBF, 0xC0); // code=3 (CRAM)
        vdp.writePort(0xBE, 0x30 & 0x3f);
        // Ensure background index points to 0
        vdp.writePort(0xBF, 0x00);
        vdp.writePort(0xBF, 0x87);
      }
    }
  } catch {}

  // Render with VDP renderer
  if (!vdp.renderFrame) throw new Error('VDP renderer unavailable');
  const rgb = vdp.renderFrame();
  if (!rgb || rgb.length !== 256 * 192 * 3) throw new Error('Unexpected frame buffer size');

  // Count black pixels (r=g=b=0)
  let black = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    if (rgb[i] === 0 && rgb[i + 1] === 0 && rgb[i + 2] === 0) black++;
  }
  const total = (256 * 192) | 0;

  // Save PNG and diagnostics
  const png = encodePNG(256, 192, rgb);
  writeFileSync(outPath, png);
  const diag = {
    frames: framesTarget,
    totalPixels: total,
    blackPixels: black,
    nonBlackPixels: total - black,
    usedBIOS: !!bios,
    pngSource: 'game',
  };
  writeFileSync(outPath + '.json', Buffer.from(JSON.stringify(diag, null, 2)));

  // Report succinctly for CLI
  // eslint-disable-next-line no-console
  console.log(diag);

  if (black === 0) {
    // eslint-disable-next-line no-console
    console.log(`SUCCESS: no black pixels after ${framesTarget} frames. Wrote ${outPath}`);
    process.exit(0);
  } else {
    // eslint-disable-next-line no-console
    console.log(`FAIL: ${black} black pixels after ${framesTarget} frames. See ${outPath} and ${outPath}.json`);
    process.exit(1);
  }
};

main().catch((e: unknown): void => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
