import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from './src/machine/machine.js';
import zlib from 'zlib';

function crc32(buf: Uint8Array): number {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function writeChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length >>> 0;
  const out = new Uint8Array(8 + len + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len, false);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcBuf = new Uint8Array(4 + len);
  crcBuf[0] = out[4];
  crcBuf[1] = out[5];
  crcBuf[2] = out[6];
  crcBuf[3] = out[7];
  crcBuf.set(data, 4);
  const crc = crc32(crcBuf);
  dv.setUint32(8 + len, crc >>> 0, false);
  return out;
}

function encodePNG(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR
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

  // IDAT: filter 0 per scanline
  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    raw.set(rgb.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const compressed = zlib.deflateSync(raw);
  const idatChunk = writeChunk('IDAT', compressed);
  const iendChunk = writeChunk('IEND', new Uint8Array(0));

  const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  out.set(sig, 0);
  out.set(ihdrChunk, sig.length);
  out.set(idatChunk, sig.length + ihdrChunk.length);
  out.set(iendChunk, sig.length + ihdrChunk.length + idatChunk.length);
  return out;
}

const rom = new Uint8Array(readFileSync('./sonic.sms'));
const cart = { rom };

const m = createMachine({
  cart,
  wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
  bus: { allowCartRam: false }
});

// Run for about 15 seconds (to get past title screen)
const cyclesPerFrame = 228 * 262; 
const totalFrames = 60 * 15; // 15 seconds

for (let frame = 0; frame < totalFrames; frame++) {
  m.runCycles(cyclesPerFrame);
}

// Use the VDP's built-in renderFrame method
const vdp = m.getVDP();
const frameBuffer = vdp.renderFrame?.();

if (frameBuffer) {
  const png = encodePNG(256, 192, frameBuffer);
  writeFileSync('sonic_with_sprites.png', png);
  
  // Count non-zero pixels
  let nonZero = 0;
  for (let i = 0; i < frameBuffer.length; i++) {
    if (frameBuffer[i] !== 0) nonZero++;
  }
  console.log(`Generated sonic_with_sprites.png with ${nonZero} non-zero RGB values`);
  
  // Get VDP state for diagnostics
  const state = vdp.getState?.();
  if (state) {
    const spriteAttrBase = ((state.regs[5] ?? 0) & 0x7e) << 7;
    console.log(`\nVDP State:`);
    console.log(`Display: ${state.displayEnabled}`);
    console.log(`VRAM writes: ${state.vramWrites}`);
    console.log(`CRAM writes: ${state.cramWrites}`);
    console.log(`Sprite Attr Base: 0x${spriteAttrBase.toString(16)}`);
    
    // Check for visible sprites
    let visibleCount = 0;
    for (let i = 0; i < 64; i++) {
      const y = state.vram[spriteAttrBase + i] ?? 0;
      if (y < 0xd0 || (y > 0xd0 && y < 0xe0)) {
        visibleCount++;
      }
    }
    console.log(`Visible sprites: ${visibleCount}`);
  }
} else {
  console.log('Failed to render frame');
}
