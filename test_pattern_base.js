import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from './build/machine/machine.js';
import * as zlib from 'zlib';

const WIDTH = 256;
const HEIGHT = 192;

function rgbFromCram(val) {
  const r = ((val >>> 4) & 0x03) * 85;
  const g = ((val >>> 2) & 0x03) * 85;
  const b = (val & 0x03) * 85;
  return [r, g, b];
}

function renderFrame(vram, cram, nameBase, patternBase) {
  const out = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let ty = 0; ty < 24; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const entryAddr = (nameBase + ((ty * 32 + tx) << 1)) & 0x3fff;
      const low = vram[entryAddr] ?? 0;
      const high = vram[(entryAddr + 1) & 0x3fff] ?? 0;
      const tileIndex = ((high & 0x03) << 8) | low;
      const pattAddr = (patternBase + (tileIndex << 5)) & 0x3fff;
      
      for (let row = 0; row < 8; row++) {
        const b0 = vram[(pattAddr + row * 4) & 0x3fff] ?? 0;
        const b1 = vram[(pattAddr + row * 4 + 1) & 0x3fff] ?? 0;
        const b2 = vram[(pattAddr + row * 4 + 2) & 0x3fff] ?? 0;
        const b3 = vram[(pattAddr + row * 4 + 3) & 0x3fff] ?? 0;
        const py = ty * 8 + row;
        
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const ci = ((b0 >>> bit) & 1) | (((b1 >>> bit) & 1) << 1) | 
                    (((b2 >>> bit) & 1) << 2) | (((b3 >>> bit) & 1) << 3);
          const cramIdx = ci & 0x1f;
          const cramVal = cram[cramIdx] ?? 0;
          const [r, g, b] = rgbFromCram(cramVal);
          const px = tx * 8 + col;
          const off = (py * WIDTH + px) * 3;
          out[off] = r; out[off + 1] = g; out[off + 2] = b;
        }
      }
    }
  }
  return out;
}

function crc32(buf) {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (~c) >>> 0;
}

function writeChunk(type, data) {
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
  crcBuf[0] = out[4]; crcBuf[1] = out[5]; crcBuf[2] = out[6]; crcBuf[3] = out[7];
  crcBuf.set(data, 4);
  const crc = crc32(crcBuf);
  dv.setUint32(8 + len, crc >>> 0, false);
  return out;
}

function encodePNG(width, height, rgb) {
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width >>> 0, false);
  dv.setUint32(4, height >>> 0, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 (truecolor)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = writeChunk('IHDR', ihdr);

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

const rom = new Uint8Array(readFileSync('./Alex Kidd - The Lost Stars (UE) [!].sms'));
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false });

// Run until display is on
const cyclesPerFrame = 59736;
for (let frame = 0; frame < 120; frame++) {
  m.runCycles(cyclesPerFrame);
  const vdp = m.getVDP();
  const vdpState = vdp.getState ? vdp.getState() : undefined;
  if (vdpState && vdpState.displayEnabled && vdpState.nonZeroVramWrites > 3000) {
    console.log(`Stopped at frame ${frame}`);
    break;
  }
}

const vdp = m.getVDP();
const vdpState = vdp.getState();

const nameBase = ((vdpState.regs[2] & 0x0e) << 10);
console.log(`Name table base: 0x${nameBase.toString(16)}`);
console.log(`R4: 0x${vdpState.regs[4].toString(16)}, bit 2: ${(vdpState.regs[4] & 0x04) !== 0}`);

// Test with different pattern bases
const tests = [
  { base: 0x0000, name: 'base_0000' },
  { base: 0x2000, name: 'base_2000' }
];

for (const test of tests) {
  const rgb = renderFrame(vdpState.vram, vdpState.cram, nameBase, test.base);
  let nonZero = 0;
  for (let i = 0; i < rgb.length; i++) if (rgb[i] !== 0) nonZero++;
  
  console.log(`\nPattern base 0x${test.base.toString(16)}: ${nonZero} non-zero RGB values`);
  
  const png = encodePNG(WIDTH, HEIGHT, rgb);
  const filename = `alex_${test.name}.png`;
  writeFileSync(filename, png);
  console.log(`Wrote ${filename}`);
}
