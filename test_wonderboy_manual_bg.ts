#!/usr/bin/env tsx

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';
import zlib from 'zlib';

// Minimal PNG encoder
const crc32 = (buf: Uint8Array): number => { let c = ~0 >>> 0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]!; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
const writeChunk = (type: string, data: Uint8Array): Uint8Array => { const len = data.length >>> 0; const out = new Uint8Array(8 + len + 4); const dv = new DataView(out.buffer); dv.setUint32(0, len, false); out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1); out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3); out.set(data, 8); const crcBuf = new Uint8Array(4 + len); crcBuf[0] = out[4]; crcBuf[1] = out[5]; crcBuf[2] = out[6]; crcBuf[3] = out[7]; crcBuf.set(data, 4); const crc = crc32(crcBuf); dv.setUint32(8 + len, crc >>> 0, false); return out; };
const encodePNG = (width: number, height: number, rgb: Uint8Array): Uint8Array => { const sig = Uint8Array.from([137,80,78,71,13,10,26,10]); const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, width >>> 0, false); dv.setUint32(4, height >>> 0, false); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; const ihdrChunk = writeChunk('IHDR', ihdr); const stride = width * 3; const raw = new Uint8Array((stride + 1) * height); for (let y=0;y<height;y++){ raw[y*(stride+1)]=0; raw.set(rgb.subarray(y*stride, y*stride+stride), y*(stride+1)+1);} const compressed = zlib.deflateSync(raw); const idatChunk = writeChunk('IDAT', compressed); const iendChunk = writeChunk('IEND', new Uint8Array(0)); const out = new Uint8Array(sig.length + ihdrChunk.length + idatChunk.length + iendChunk.length); out.set(sig,0); out.set(ihdrChunk, sig.length); out.set(idatChunk, sig.length + ihdrChunk.length); out.set(iendChunk, sig.length + ihdrChunk.length + idatChunk.length); return out; };

const dumpFrame = (rgb: Uint8Array, filename: string): void => { try { const outDir = 'traces'; if (!existsSync(outDir)) mkdirSync(outDir); const png = encodePNG(256,192,rgb); const outPath = `${outDir}/${filename}`; writeFileSync(outPath, png); console.log(`Saved frame to ${outPath}`); } catch(e) { console.warn('Could not save PNG:', (e as Error).message);} };

const main = (): number => {
  console.log('Wonder Boy with manual background color test\n');

  // Load ROM and BIOS
  const romData = readFileSync('wonderboy5.sms');
  let biosData: Uint8Array;
  try {
    biosData = new Uint8Array(readFileSync('./third_party/mame/roms/sms1/mpr-10052.rom'));
    console.log('Using BIOS: ./third_party/mame/roms/sms1/mpr-10052.rom');
  } catch {
    biosData = new Uint8Array(readFileSync('./mpr-10052.rom'));
    console.log('Using BIOS: ./mpr-10052.rom');
  }

  const cart = { rom: new Uint8Array(romData) };
  const machine = createMachine({ cart, useManualInit: false, bus: { bios: biosData } });
  const vdp = machine.getVDP();

  const st = vdp.getState?.();
  const cyclesPerLine = st?.cyclesPerLine ?? 228;
  const linesPerFrame = st?.linesPerFrame ?? 262;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;

  // Run exactly 120 frames
  for (let f = 1; f <= 120; f++) {
    machine.runCycles(cyclesPerFrame);
    if (f % 30 === 0) {
      const s = vdp.getState?.();
      const pc = machine.getCPU().getState().pc;
      console.log(`Ran ${f} frames: PC=0x${pc.toString(16).padStart(4,'0')} Display=${s?.displayEnabled ? 'ON' : 'OFF'}`);
    }
  }

  // Get final state
  const finalState = vdp.getState?.();
  if (!finalState) {
    console.error('Could not get VDP state');
    return 1;
  }

  console.log('\n=== Before Manual Fix ===');
  console.log(`Register 7 (background color): 0x${finalState.regs[7]?.toString(16).padStart(2, '0')}`);

  // Manually set background color to use CRAM[2] (light blue)
  console.log('\n=== Setting Background Color to CRAM[2] ===');
  vdp.writePort(0xBF, 0x02); // Value (CRAM index 2)
  vdp.writePort(0xBF, 0x87); // Register 7

  // Check the new state
  const newState = vdp.getState?.();
  console.log(`New Register 7: 0x${newState?.regs[7]?.toString(16).padStart(2, '0')}`);

  // Try to render a frame
  if (!vdp.renderFrame) {
    console.error('renderFrame not available');
    return 2;
  }
  
  const frame = vdp.renderFrame();
  if (!frame || frame.length !== 256*192*3) {
    console.error('Invalid frame');
    return 2;
  }

  // Count colors
  const colorCounts = new Map<string, number>();
  for (let i = 0; i < frame.length; i += 3) {
    const r = frame[i] ?? 0;
    const g = frame[i + 1] ?? 0;
    const b = frame[i + 2] ?? 0;
    const key = `${r},${g},${b}`;
    colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
  }

  console.log('\n=== Frame Colors After Fix ===');
  const sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < Math.min(5, sortedColors.length); i++) {
    const [color, count] = sortedColors[i]!;
    const percentage = (count / (256 * 192) * 100).toFixed(2);
    console.log(`  RGB(${color}): ${count} pixels (${percentage}%)`);
  }

  // Save the frame
  dumpFrame(frame, 'wonderboy_manual_bg.png');

  // Check if we have light blue
  const lightBlueCount = colorCounts.get('170,255,255') ?? 0;
  const lightBluePercentage = (lightBlueCount / (256 * 192) * 100).toFixed(2);
  console.log(`\nLight blue coverage: ${lightBlueCount} pixels (${lightBluePercentage}%)`);

  if (lightBlueCount > 0) {
    console.log('✅ SUCCESS: Light blue background detected!');
    return 0;
  } else {
    console.log('❌ FAIL: No light blue background found');
    return 1;
  }
};

const code = main();
process.exit(code);
