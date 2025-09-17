#!/usr/bin/env tsx

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';
import zlib from 'zlib';

// Encode an RGB buffer (width*height*3) to a PNG for debugging
const crc32 = (buf: Uint8Array): number => {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
};

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
  const crcBuf = new Uint8Array(4 + len);
  crcBuf[0] = out[4];
  crcBuf[1] = out[5];
  crcBuf[2] = out[6];
  crcBuf[3] = out[7];
  crcBuf.set(data, 4);
  const crc = crc32(crcBuf);
  dv.setUint32(8 + len, crc >>> 0, false);
  return out;
};

const encodePNG = (width: number, height: number, rgb: Uint8Array): Uint8Array => {
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width >>> 0, false);
  dv.setUint32(4, height >>> 0, false);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // truecolor
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const ihdrChunk = writeChunk('IHDR', ihdr);

  const stride = width * 3;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
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
};

// Utility helpers for frame analysis
const rgbAt = (buf: Uint8Array, x: number, y: number): [number, number, number] => {
  const idx = (y * 256 + x) * 3;
  return [buf[idx] ?? 0, buf[idx + 1] ?? 0, buf[idx + 2] ?? 0];
};

const keyOf = (r: number, g: number, b: number): string => `${r},${g},${b}`;
const parseKey = (k: string): [number, number, number] => k.split(',').map(v => parseInt(v, 10)) as [number, number, number];

const brightness = (r: number, g: number, b: number): number => r + g + b;

const isWhite = (r: number, g: number, b: number): boolean => r === 255 && g === 255 && b === 255;

const isLightBlueish = (r: number, g: number, b: number): boolean => {
  // SMS palette uses steps of 0, 85, 170, 255. Light blue backgrounds are typically low R, high G/B.
  // Accept a generous window.
  const high = (v: number): boolean => v >= 170;
  const low = (v: number): boolean => v <= 170;
  return low(r) && high(g) && high(b) && b >= g && brightness(r, g, b) >= 425; // fairly bright
};

const isDarkerBlueThan = (bg: [number, number, number], p: [number, number, number]): boolean => {
  const [br, bgc, bb] = bg; // bg components
  const [r, g, b] = p;
  // "Darker blue" relative to background: keep blue-ish, overall dimmer than background.
  const blueish = b >= g && g >= r && b >= 85;
  const dimmer = brightness(r, g, b) <= brightness(br, bgc, bb) - 85; // at least one palette step darker
  return blueish && dimmer;
};

const main = (): number => {
  console.log('Headless Wonder Boy: run 120 frames and verify SEGA logo/light blue background\n');

  // Load ROM
  const romData = readFileSync('wonderboy5.sms');
  const cart = { rom: new Uint8Array(romData) };

  // Create machine with manual initialization (no BIOS)
  const machine = createMachine({ cart, useManualInit: true });
  const vdp = machine.getVDP();

  // Derive cycles per frame from VDP state if available
  const st = typeof vdp.getState === 'function' ? vdp.getState?.() : undefined;
  const cyclesPerLine = st?.cyclesPerLine ?? 228;
  const linesPerFrame = st?.linesPerFrame ?? 262;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;

  console.log(`Using cyclesPerFrame=${cyclesPerFrame} (${cyclesPerLine}x${linesPerFrame})`);

  // Run exactly 120 frames
  for (let f = 1; f <= 120; f++) {
    machine.runCycles(cyclesPerFrame);
    if (f % 30 === 0) {
      const s = vdp.getState?.();
      const pc = machine.getCPU().getState().pc;
      console.log(`Ran ${f} frames: PC=0x${pc.toString(16).padStart(4, '0')} Display=${s?.displayEnabled ? 'ON' : 'OFF'}`);
    }
  }

  // Render final frame
  if (!vdp.renderFrame) {
    console.error('renderFrame() not available on VDP');
    return 2;
  }
  const frame = vdp.renderFrame();
  if (!frame || frame.length !== 256 * 192 * 3) {
    console.error('Invalid frame buffer');
    return 2;
  }

  // Build color histogram to find dominant background color
  const counts = new Map<string, number>();
  for (let y = 0; y < 192; y++) {
    for (let x = 0; x < 256; x++) {
      const [r, g, b] = rgbAt(frame, x, y);
      const k = keyOf(r, g, b);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }

  let bgKey = '';
  let bgCount = 0;
  for (const [k, c] of counts.entries()) {
    if (c > bgCount) { bgCount = c; bgKey = k; }
  }
  const bg = parseKey(bgKey);
  const bgShare = bgCount / (256 * 192);
  console.log(`Most common color: rgb(${bg[0]},${bg[1]},${bg[2]}) with ${(bgShare * 100).toFixed(2)}% coverage`);

  // Validate background is light blue-ish and covers most of the screen
  if (!isLightBlueish(bg[0], bg[1], bg[2])) {
    console.error(`FAIL: Dominant background is not light blue-ish: rgb(${bg[0]},${bg[1]},${bg[2]})`);
    dumpFrame(frame, 'wonderboy_120.png');
    return 1;
  }
  if (bgShare < 0.60) { // must be mostly background
    console.error(`FAIL: Background coverage too low: ${(bgShare * 100).toFixed(2)}% (< 60%)`);
    dumpFrame(frame, 'wonderboy_120.png');
    return 1;
  }

  // Inspect 10x10 center region
  const cx = 128, cy = 96; // center
  const startX = cx - 5, startY = cy - 5;
  let nonBgCenter = 0;
  let sawWhite = 0;
  let sawDarkBlue = 0;
  const unexpected = new Set<string>();
  for (let y = startY; y < startY + 10; y++) {
    for (let x = startX; x < startX + 10; x++) {
      const [r, g, b] = rgbAt(frame, x, y);
      const k = keyOf(r, g, b);
      if (k === bgKey) continue;
      nonBgCenter++;
      if (isWhite(r, g, b)) { sawWhite++; continue; }
      if (isDarkerBlueThan(bg, [r, g, b])) { sawDarkBlue++; continue; }
      unexpected.add(k);
    }
  }

  if (nonBgCenter === 0) {
    console.error('FAIL: Center 10x10 area contains only background');
    dumpFrame(frame, 'wonderboy_120.png');
    return 1;
  }

  if (unexpected.size > 0) {
    console.error(`FAIL: Center 10x10 contains unexpected colors: ${Array.from(unexpected).join(' | ')}`);
    dumpFrame(frame, 'wonderboy_120.png');
    return 1;
  }

  if (sawWhite === 0 || sawDarkBlue === 0) {
    console.error(`FAIL: Center 10x10 did not contain both white and darker blue (white=${sawWhite}, darkBlue=${sawDarkBlue})`);
    dumpFrame(frame, 'wonderboy_120.png');
    return 1;
  }

  console.log('PASS: Background is light blue and center contains only white and darker blue (SEGA logo expected).');
  dumpFrame(frame, 'wonderboy_120.png');
  return 0;
};

const dumpFrame = (rgb: Uint8Array, filename: string): void => {
  try {
    const outDir = 'traces';
    if (!existsSync(outDir)) mkdirSync(outDir);
    const png = encodePNG(256, 192, rgb);
    const outPath = `${outDir}/${filename}`;
    writeFileSync(outPath, png);
    console.log(`Saved frame to ${outPath}`);
  } catch (e) {
    console.warn('Could not save PNG:', (e as Error).message);
  }
};

const code = main();
process.exit(code);

