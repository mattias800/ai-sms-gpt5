import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createMachine } from '../machine/machine.js';
import * as zlib from 'zlib';
// Simple SMS renderer: background tiles only (no sprites), no scroll, no flips.
const WIDTH = 256;
const HEIGHT = 192;
const TILES_X = 32;
const TILES_Y = 24;
function rgbFromCram(val) {
    const r = ((val >>> 4) & 0x03) * 85;
    const g = ((val >>> 2) & 0x03) * 85;
    const b = (val & 0x03) * 85;
    return [r, g, b];
}
function renderFrame(vram, cram, nameBase, patternBase, debugNoCram = false) {
    const v = vram instanceof Uint8Array ? vram : Uint8Array.from(vram);
    const c = cram instanceof Uint8Array ? cram : Uint8Array.from(cram);
    const out = new Uint8Array(WIDTH * HEIGHT * 3);
    // Debug: Show entire name table including off-screen area
    for (let ty = 0; ty < 28; ty++) { // Show 28 rows to see more
        for (let tx = 0; tx < TILES_X; tx++) {
            if (ty >= TILES_Y)
                continue; // Skip rows beyond screen height
            const entryAddr = (nameBase + ((ty * 32 + tx) << 1)) & 0x3fff;
            const low = (v[entryAddr] ?? 0) & 0xff;
            const high = (v[(entryAddr + 1) & 0x3fff] ?? 0) & 0xff;
            const tileIndex = ((high & 0x03) << 8) | low;
            const pattAddr = (patternBase + (tileIndex << 5)) & 0x3fff;
            for (let row = 0; row < 8; row++) {
                const b0 = (v[(pattAddr + row * 4) & 0x3fff] ?? 0) & 0xff;
                const b1 = (v[(pattAddr + row * 4 + 1) & 0x3fff] ?? 0) & 0xff;
                const b2 = (v[(pattAddr + row * 4 + 2) & 0x3fff] ?? 0) & 0xff;
                const b3 = (v[(pattAddr + row * 4 + 3) & 0x3fff] ?? 0) & 0xff;
                const py = ty * 8 + row;
                if (py >= HEIGHT)
                    continue;
                for (let col = 0; col < 8; col++) {
                    const bit = 7 - col;
                    const ci = ((b0 >>> bit) & 1) | (((b1 >>> bit) & 1) << 1) | (((b2 >>> bit) & 1) << 2) | (((b3 >>> bit) & 1) << 3);
                    const cramIdx = ci & 0x1f;
                    let r, g, b;
                    if (debugNoCram) {
                        const vshade = ci === 0 ? 0 : (ci * 16) & 0xff;
                        r = vshade;
                        g = vshade;
                        b = vshade;
                    }
                    else {
                        const cramVal = (c[cramIdx] ?? 0) & 0x3f;
                        [r, g, b] = rgbFromCram(cramVal);
                    }
                    const px = tx * 8 + col;
                    if (px >= WIDTH)
                        continue;
                    const off = (py * WIDTH + px) * 3;
                    out[off] = r;
                    out[off + 1] = g;
                    out[off + 2] = b;
                }
            }
        }
    }
    return out;
}
// Minimal PNG writer using Node zlib
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
    crcBuf[0] = out[4];
    crcBuf[1] = out[5];
    crcBuf[2] = out[6];
    crcBuf[3] = out[7];
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
const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
if (!existsSync(romFile)) {
    console.error(`ROM file not found: ${romFile}`);
    process.exit(1);
}
console.log('=== Testing Alex Kidd - The Lost Stars ===\n');
const rom = new Uint8Array(readFileSync(romFile));
console.log(`ROM size: ${rom.length} bytes (${rom.length / 1024}KB)`);
// Check header
console.log('\nROM Header at 0x7FF0:');
const header = rom.subarray(0x7FF0, 0x8000);
let headerStr = '';
for (let i = 0; i < 16; i++) {
    const c = header[i];
    headerStr += (c >= 32 && c < 127) ? String.fromCharCode(c) : '.';
}
console.log('Text:', headerStr);
// Create and run machine
const cart = { rom };
const m = createMachine({ cart, fastBlocks: false }); // Disabled for more accurate timing
console.log('\nRunning until display is enabled with graphics...');
const cyclesPerFrame = 59736;
let captureFrame = 420; // Capture later frame when more tiles loaded
for (let frame = 0; frame < 500; frame++) {
    m.runCycles(cyclesPerFrame);
    // Check if we should capture this frame
    const vdpCheck = m.getVDP();
    const vdpStateCheck = vdpCheck.getState ? vdpCheck.getState() : undefined;
    // Don't break early - run to frame 420 for more tiles
    if (frame === captureFrame) {
        console.log(`Frame ${frame}: Capturing with ${vdpStateCheck?.nonZeroVramWrites ?? 0} non-zero VRAM writes`);
        break;
    }
    if (frame % 60 === 0) {
        const cpu = m.getCPU();
        const cpuState = cpu.getState();
        const status = vdpStateCheck ?
            `Display=${vdpStateCheck.displayEnabled}, NonZero=${vdpStateCheck.nonZeroVramWrites}` :
            'No VDP state';
        console.log(`Frame ${frame}: PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, ${status}`);
    }
}
console.log(`\nCapturing frame ${captureFrame}...`);
// Get final state
const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();
const cpuState = cpu.getState();
const vdpState = vdp.getState ? vdp.getState() : undefined;
const stats = bus.getVDPWriteStats();
// Generate PNG
const nameBase = vdpState ? (((vdpState.regs[2] ?? 0) & 0x0e) << 10) : 0x3c00;
// For Alex Kidd, tile data is at 0x0000 regardless of R4 bit 2
// TODO: Investigate why R4 bit 2 doesn't work as expected
const patternBase = 0x0000;
const rgb = renderFrame(vdpState?.vram ?? new Uint8Array(0x4000), vdpState?.cram ?? new Array(32).fill(0), nameBase, patternBase, false);
let pngNonZero = 0;
for (let i = 0; i < rgb.length; i++)
    if (rgb[i] !== 0)
        pngNonZero++;
const png = encodePNG(WIDTH, HEIGHT, rgb);
writeFileSync('alex_kidd_frame.png', png);
// Create diagnostic JSON
const displayEnabled = vdpState ? ((vdpState.regs[1] ?? 0) & 0x40) !== 0 : false;
const vramWrites = vdpState?.vramWrites ?? 0;
const diag = {
    displayEnabled,
    vblankIrqEnabled: vdpState ? ((vdpState.regs[1] ?? 0) & 0x20) !== 0 : false,
    vramWrites,
    cramWrites: vdpState?.cramWrites ?? 0,
    nonZeroVRAM: vdpState?.vram.filter(b => b !== 0).length ?? 0,
    nonZeroVramWrites: vdpState?.nonZeroVramWrites ?? 0,
    lastNonZeroVramAddr: vdpState?.lastNonZeroVramAddr !== undefined ?
        `0x${vdpState.lastNonZeroVramAddr.toString(16).padStart(4, '0')}` : 'none',
    vdpDataWrites: stats.data,
    vdpCtrlWrites: stats.control,
    regs: vdpState?.regs.slice(0, 16) ?? [],
    nameTableBase: vdpState ? (((vdpState.regs[2] ?? 0) & 0x0e) << 10).toString(16) : '0',
    bgPatternBase: vdpState ? (((vdpState.regs[4] ?? 0) & 0x07) << 11).toString(16) : '0',
    pngNonZeroRGB: pngNonZero,
    pngSource: (displayEnabled && vramWrites > 1000) ? 'game' : 'fallback',
    lastPC: cpuState.pc.toString(16),
};
writeFileSync('alex_kidd_frame.png.json', JSON.stringify(diag, null, 2));
console.log('\n=== Results ===');
console.log(diag);
console.log(`\nWrote alex_kidd_frame.png (${WIDTH}x${HEIGHT})`);
// Status check
if (diag.displayEnabled && diag.vramWrites > 1000) {
    console.log('\n✅ Game appears to be running!');
}
else if (cpuState.pc < 0x100) {
    console.log('\n⚠️ Game might be stuck in initialization');
}
else {
    console.log('\n⚠️ Check the PNG for visual output');
}
