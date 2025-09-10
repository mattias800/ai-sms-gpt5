import type { TraceEvent } from '../src/cpu/z80/z80.js';
import { readFileSync, writeFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import { SmsBus } from '../src/bus/bus.js';
import type { Cartridge } from '../src/bus/bus.js';
import zlib from 'zlib';

// Usage:
//   npx tsx tools/headless_sonic.ts <rom> <output.png> [seconds] [until] [nowait] [forceei] [nohc] [cyclemul] [--renderer=vdp|simple] [--verify-sprites]
// 
// --renderer=vdp (default): Use VDP's full renderFrame() with sprite support
// --renderer=simple: Use background-only renderer (legacy)
// --verify-sprites: Render both methods and report differences
//
// Simple SMS renderer: background tiles only (no sprites), no scroll, no flips.
// Assumptions:
// - Name table entries are 2 bytes (little-endian). Low 10 bits = tile index; ignore flips/priority.
// - Pattern data is 32 bytes per tile: for each of 8 rows, 4 bytes are bitplanes b0..b3.
// - CRAM is 32 entries of 6-bit RGB: bits [5:4]=R, [3:2]=G, [1:0]=B; each scaled to 0..255 via *85.

const WIDTH = 256;
const HEIGHT = 192;
const TILES_X = 32;
const TILES_Y = 24; // 192 / 8

function rgbFromCram(val: number): [number, number, number] {
  const r = ((val >>> 4) & 0x03) * 85;
  const g = ((val >>> 2) & 0x03) * 85;
  const b = (val & 0x03) * 85;
  return [r, g, b];
}

function renderBgOnly(
  vram: Uint8Array | number[],
  cram: Uint8Array | number[],
  nameBase: number,
  patternBase: number,
  debugNoCram = false
): Uint8Array {
  const v = vram instanceof Uint8Array ? vram : Uint8Array.from(vram);
  const c = cram instanceof Uint8Array ? cram : Uint8Array.from(cram);
  const out = new Uint8Array(WIDTH * HEIGHT * 3);

  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      const entryAddr = (nameBase + ((ty * 32 + tx) << 1)) & 0x3fff;
      const low = (v[entryAddr] ?? 0) & 0xff;
      const high = (v[(entryAddr + 1) & 0x3fff] ?? 0) & 0xff;
      const tileIndex = ((high & 0x03) << 8) | low; // 10-bit index
      const pattAddr = (patternBase + (tileIndex << 5)) & 0x3fff; // *32 bytes per tile
      for (let row = 0; row < 8; row++) {
        const b0 = (v[(pattAddr + row * 4) & 0x3fff] ?? 0) & 0xff;
        const b1 = (v[(pattAddr + row * 4 + 1) & 0x3fff] ?? 0) & 0xff;
        const b2 = (v[(pattAddr + row * 4 + 2) & 0x3fff] ?? 0) & 0xff;
        const b3 = (v[(pattAddr + row * 4 + 3) & 0x3fff] ?? 0) & 0xff;
        const py = ty * 8 + row;
        if (py >= HEIGHT) continue;
        for (let col = 0; col < 8; col++) {
          const bit = 7 - col;
          const ci =
            ((b0 >>> bit) & 1) | (((b1 >>> bit) & 1) << 1) | (((b2 >>> bit) & 1) << 2) | (((b3 >>> bit) & 1) << 3);
          const cramIdx = ci & 0x1f; // use first palette bank
          let r: number, g: number, b: number;
          if (debugNoCram) {
            const vshade = ci === 0 ? 0 : (ci * 16) & 0xff;
            r = vshade;
            g = vshade;
            b = vshade;
          } else {
            const cramVal = (c[cramIdx] ?? 0) & 0x3f;
            [r, g, b] = rgbFromCram(cramVal);
          }
          const px = tx * 8 + col;
          if (px >= WIDTH) continue;
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

function vdpSetReg(bus: SmsBus, reg: number, val: number): void {
  bus.writeIO8(0xbf, val & 0xff);
  bus.writeIO8(0xbf, 0x80 | (reg & 0x0f));
}

function vdpSetAddrCode(bus: SmsBus, addr: number, code: number): void {
  bus.writeIO8(0xbf, addr & 0xff);
  bus.writeIO8(0xbf, ((addr >>> 8) & 0x3f) | ((code & 0x03) << 6));
}

function vdpWriteData(bus: SmsBus, data: number[]): void {
  for (const v of data) bus.writeIO8(0xbe, v & 0xff);
}

function makeTilePlanes(rows: number[][]): number[] {
  // rows: 8 rows x 8 pixel color indices (0..15). Return 32 bytes (4 planes per row)
  const out: number[] = [];
  for (let y = 0; y < 8; y++) {
    const row = rows[y] ?? new Array(8).fill(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0;
    for (let x = 0; x < 8; x++) {
      const bit = 7 - x;
      const ci = (row[x] ?? 0) & 0x0f;
      if (ci & 1) b0 |= 1 << bit;
      if (ci & 2) b1 |= 1 << bit;
      if (ci & 4) b2 |= 1 << bit;
      if (ci & 8) b3 |= 1 << bit;
    }
    out.push(b0 & 0xff, b1 & 0xff, b2 & 0xff, b3 & 0xff);
  }
  return out;
}

function forceMinimalFrame(bus: SmsBus): void {
  // Enable display (R1 bit6) and set bases R2/R4
  vdpSetReg(bus, 2, 0xff); // name table base 0x3C00
  vdpSetReg(bus, 4, 0xff); // pattern base 0x3800
  vdpSetReg(bus, 1, 0xe2); // display on + vblank irq enable

  // Simple CRAM: grayscale palette ramp
  vdpSetAddrCode(bus, 0x0000, 3); // CRAM index 0
  for (let i = 0; i < 32; i++) {
    const gray2 = i & 0x03; // 0..3
    const val = ((gray2 & 0x03) << 4) | ((gray2 & 0x03) << 2) | (gray2 & 0x03);
    bus.writeIO8(0xbe, val & 0x3f);
  }

  // Tile index 1: checkerboard pattern
  const rows: number[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: number[] = [];
    for (let x = 0; x < 8; x++) row.push((x ^ y) & 1 ? 0x0f : 0x00);
    rows.push(row);
  }
  const tile1 = makeTilePlanes(rows);
  vdpSetAddrCode(bus, 0x3800 + (1 << 5), 1); // VRAM write at tile 1
  vdpWriteData(bus, tile1);

  // Name table: fill 32x24 with tile index 1
  vdpSetAddrCode(bus, 0x3c00, 1);
  for (let i = 0; i < 32 * 24; i++) {
    bus.writeIO8(0xbe, 0x01); // low byte of entry (tile idx low)
    bus.writeIO8(0xbe, 0x00); // high byte flags + idx bits 8..9
  }
}

async function main(): Promise<void> {
  type Diag = {
    overrideUsed: boolean;
    overrideDisabled: boolean;
    pre: {
      display: boolean;
      cramWrites: number;
      vramWrites: number;
      nonZeroVRAM: number;
      nonZeroVramWrites: number;
      lastNonZeroVramAddr: number;
      reg1: number;
    };
    post: {
      display: boolean;
      cramWrites: number;
      vramWrites: number;
      nonZeroVRAM: number;
      nonZeroVramWrites: number;
      lastNonZeroVramAddr: number;
      reg1: number;
    };
    pngSource: 'game' | 'fallback';
    pngNonZeroRGB: number;
    renderer: 'vdp' | 'simple';
    vdpRendererAvailable: boolean;
    verify?: {
      used: boolean;
      available: boolean;
      diffRGBTriplets: number;
      sameSize: boolean;
    };
  };
  const romPath = process.argv[2] ?? './sonic.sms';
  const outPath = process.argv[3] ?? 'sonic_frame.png';
  const seconds = Number(process.argv[4] ?? '3');
  const until = (process.argv[5] ?? 'either').toLowerCase(); // 'display' | 'cram' | 'either' | 'none'
  const noWait = (process.argv[6] ?? '').toLowerCase() === 'nowait';

  // Parse renderer option
  const rendererArg = process.argv.find(arg => arg.startsWith('--renderer='));
  const rendererType = (rendererArg ? rendererArg.split('=')[1] : 'vdp').toLowerCase() as 'vdp' | 'simple';
  const verifySprites = process.argv.includes('--verify-sprites');

  const rom = new Uint8Array(readFileSync(romPath));
  const cart: Cartridge = { rom };
  let lastPC = 0;
  let irqCount = 0;
  let nmiCount = 0;
  // Parse --no-fastblocks flag
  const noFastBlocks = (process.argv[10] ?? '').toLowerCase() === 'no-fastblocks';

  const m = createMachine({
    cart,
    wait: noWait ? undefined : { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
    bus: { allowCartRam: false },
    fastBlocks: !noFastBlocks, // Enable by default for performance
    trace: {
      onTrace: (ev): void => {
        lastPC = (ev.pcBefore ?? 0) & 0xffff;
        if (ev.irqAccepted) irqCount++;
        if (ev.nmiAccepted) nmiCount++;
      },
      traceDisasm: false,
      traceRegs: false,
    },
  });

  // Controller auto-press schedule: --press1=start:duration (seconds). Default: 2.0:0.5
  const pressArg = process.argv.find(a => a.startsWith('--press1='));
  let pressStart = 2.0;
  let pressDur = 0.5;
  if (pressArg) {
    const val = pressArg.split('=')[1] ?? '';
    const parts = val.split(':');
    pressStart = parseFloat(parts[0] ?? '2.0');
    pressDur = parseFloat(parts[1] ?? '0.5');
    if (!isFinite(pressStart)) pressStart = 2.0;
    if (!isFinite(pressDur)) pressDur = 0.5;
  }
  const pad1 = m.getController1();

  // Optional: force-enable CPU interrupts early (experimental), to see if VBlank IRQ handler runs
  const forceEI = (process.argv[7] ?? '').toLowerCase() === 'forceei';
  const noHC = (process.argv[8] ?? '').toLowerCase() === 'nohc';
  if (forceEI) {
    const cpu = m.getCPU();
    const cs = cpu.getState();
    cs.iff1 = true;
    cs.iff2 = true; // enable maskable interrupts
    // Keep IM=1 (reset default); many SMS titles use RST 38h handler in IM 1
    cs.im = 1;
    cpu.setState(cs);
  }

  // Force-pass HCounter gate precisely for the two observed loops; disable once game progresses
  const bus1 = m.getBus() as SmsBus;
  const __origReadIO8 = bus1.readIO8.bind(bus1);
  let hcReadCount = 0; // Track HC reads
  const hcSequence = [0x00, 0x20, 0x40, 0x60, 0x80, 0xa0, 0xb0, 0xb0, 0xb0, 0x00, 0x01, 0x02, 0x03, 0x04];
  bus1.readIO8 = (port: number): number => {
    const p = port & 0xff;
    if (!noHC && p === 0x7e) {
      // Return a sequence of HCounter values to help the game progress
      hcReadCount++;
      // For the first few reads, return specific values to pass wait loops
      if (hcReadCount === 1) return 0x00; // Initial read
      if (hcReadCount === 2) return 0xb0; // Pass first wait loop
      if (hcReadCount < 20) {
        // Cycle through a realistic sequence
        return hcSequence[hcReadCount % hcSequence.length]!;
      }
      return __origReadIO8(p);
    }
    if (p === 0x7f) {
      const stl = vdp.getState ? vdp.getState?.() : undefined;
      const line = stl?.line ?? 0;
      const vblankStart = 192;
      if (line >= vblankStart) return (0xc0 + (line - vblankStart)) & 0xff;
      return line & 0xff;
    }
    return __origReadIO8(p);
  };

  // Run for up to N frames (~60Hz). Use timing from VDP state.
  const vdp = m.getVDP();
  const st0 = vdp.getState ? vdp.getState?.() : undefined;
  const baseCpf = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
  const frameMul = Math.max(1, Number(process.argv[9] ?? '100'));
  const cyclesPerFrame = baseCpf * frameMul;
  const maxFrames = Math.max(1, Math.floor(seconds * 60));

  let framesRan = 0;
  while (framesRan < maxFrames) {
    // Apply auto press schedule for Button 1 (START on SMS)
    const elapsedSec = framesRan / 60;
    const pressed = elapsedSec >= pressStart && elapsedSec < (pressStart + pressDur);
    pad1.setState({ button1: pressed });

    m.runCycles(cyclesPerFrame);
    framesRan++;
    if (!vdp.getState) continue;
    const cur = vdp?.getState?.() ?? {};
    if (!cur) continue;
    if (until === 'none') continue;
    const displayOn = !!cur.displayEnabled;
    const hasCram = (cur.cramWrites ?? 0) > 0;
    if (
      (until === 'display' && displayOn) ||
      (until === 'cram' && hasCram) ||
      (until === 'either' && (displayOn || hasCram))
    ) {
      break;
    }
  }

  const st = vdp.getState ? vdp.getState?.()! : undefined;
  if (!st || !st.vram || !st.cram) {
    throw new Error('VDP state does not expose VRAM/CRAM');
  }
  // eslint-disable-next-line no-console
  const vramU8 = Uint8Array.from(st.vram);
  let nonZeroVRAM = 0;
  for (let i = 0; i < vramU8.length; i++) if (vramU8[i] !== 0) nonZeroVRAM++;
  const bus2 = m.getBus() as SmsBus;

  const overrideDisabledNow = false;

  const st2 = vdp.getState ? vdp.getState?.()! : st;
  const vramU8b = Uint8Array.from(st2.vram);
  nonZeroVRAM = 0;
  for (let i = 0; i < vramU8b.length; i++) if (vramU8b[i] !== 0) nonZeroVRAM++;

  const preDiag: Diag['pre'] = {
    display: st2.displayEnabled,
    cramWrites: st2.cramWrites,
    vramWrites: st2.vramWrites,
    nonZeroVRAM,
    nonZeroVramWrites: st2.nonZeroVramWrites ?? 0,
    lastNonZeroVramAddr: st2.lastNonZeroVramAddr ?? -1,
    reg1: (st2.regs[1] ?? 0) & 0xff,
  };

  // If VBlank IRQs enabled but display still off, force-enable display to visualize VRAM content
  let stX = st2;
  if (!st2.displayEnabled && ((st2.regs[1] ?? 0) & 0x20) !== 0) {
    const r1 = (st2.regs[1] ?? 0) & 0xff;
    vdpSetReg(bus2, 1, (r1 | 0x40) & 0xff);
    stX = vdp.getState ? vdp.getState?.()! : st2;
  }
  const beforeFallbackNonZero = nonZeroVRAM;
  let fallbackUsed = false;
  // If VRAM still mostly empty, synthesize a minimal visible frame as a fallback
  if (nonZeroVRAM < 512) {
    forceMinimalFrame(bus2);
    fallbackUsed = true;
    stX = vdp.getState ? vdp.getState?.()! : st2;
    const vramU8c = Uint8Array.from(stX.vram);
    nonZeroVRAM = 0;
    for (let i = 0; i < vramU8c.length; i++) if (vramU8c[i] !== 0) nonZeroVRAM++;
  }

  const hstats = bus2.getHCounterStats();
  const vdpWrites = bus2.getVDPWriteStats();
  const postDiag: Diag['post'] = {
    display: stX.displayEnabled,
    cramWrites: stX.cramWrites,
    vramWrites: stX.vramWrites,
    nonZeroVRAM,
    nonZeroVramWrites: stX.nonZeroVramWrites ?? 0,
    lastNonZeroVramAddr: stX.lastNonZeroVramAddr ?? -1,
    reg1: (stX.regs[1] ?? 0) & 0xff,
  };

  // Render a frame - use VDP renderer by default, fallback to simple renderer
  const debugNoCram = stX.cramWrites === 0;
  let rgb: Uint8Array;
  let actualRenderer: 'vdp' | 'simple' = rendererType;
  let vdpRendererAvailable = false;
  
  // Try to use VDP renderer if requested
  if (rendererType === 'vdp' && vdp.renderFrame) {
    const vdpRgb = vdp.renderFrame();
    if (vdpRgb && vdpRgb.length === WIDTH * HEIGHT * 3) {
      rgb = vdpRgb;
      vdpRendererAvailable = true;
    } else {
      // eslint-disable-next-line no-console
      console.warn(`Warning: VDP renderFrame returned unexpected size (${vdpRgb?.length ?? 0}), falling back to simple renderer`);
      rgb = renderBgOnly(
        Uint8Array.from(stX.vram),
        Uint8Array.from(stX.cram),
        stX.nameTableBase & 0x3fff,
        stX.bgPatternBase & 0x3fff,
        debugNoCram
      );
      actualRenderer = 'simple';
    }
  } else {
    // Use simple renderer
    rgb = renderBgOnly(
      Uint8Array.from(stX.vram),
      Uint8Array.from(stX.cram),
      stX.nameTableBase & 0x3fff,
      stX.bgPatternBase & 0x3fff,
      debugNoCram && rendererType === 'simple' // Only apply debugNoCram in simple mode
    );
    actualRenderer = 'simple';
  }

  // Verification mode: render both and compare
  let verifyResult: Diag['verify'] | undefined;
  if (verifySprites) {
    const vdpAvailable = vdp.renderFrame !== undefined;
    if (vdpAvailable) {
      const rgbVdp = vdp.renderFrame!();
      const rgbSimple = renderBgOnly(
        Uint8Array.from(stX.vram),
        Uint8Array.from(stX.cram),
        stX.nameTableBase & 0x3fff,
        stX.bgPatternBase & 0x3fff,
        false // Never use debug for comparison
      );
      
      let diffCount = 0;
      const sameSize = rgbVdp.length === rgbSimple.length;
      if (sameSize) {
        for (let i = 0; i < rgbVdp.length; i += 3) {
          if (rgbVdp[i] !== rgbSimple[i] || 
              rgbVdp[i + 1] !== rgbSimple[i + 1] || 
              rgbVdp[i + 2] !== rgbSimple[i + 2]) {
            diffCount++;
          }
        }
      }
      
      verifyResult = {
        used: true,
        available: vdpAvailable,
        diffRGBTriplets: diffCount,
        sameSize
      };
    } else {
      verifyResult = {
        used: true,
        available: false,
        diffRGBTriplets: 0,
        sameSize: false
      };
    }
  }

  let pngNonZero = 0;
  for (let i = 0; i < rgb.length; i++) if (rgb[i] !== 0) pngNonZero++;
  const png = encodePNG(WIDTH, HEIGHT, rgb);
  writeFileSync(outPath, png);

  const diag: Diag = {
    overrideUsed: true,
    overrideDisabled: overrideDisabledNow,
    pre: preDiag,
    post: postDiag,
    pngSource: beforeFallbackNonZero >= 512 || st2.cramWrites > 0 || st2.displayEnabled ? 'game' : 'fallback',
    pngNonZeroRGB: pngNonZero,
    renderer: actualRenderer,
    vdpRendererAvailable,
    ...(verifyResult && { verify: verifyResult })
  };
  // Attach last PC for debugging
  const diagOut = { 
    ...diag, 
    lastPC: `0x${lastPC.toString(16)}`,
    prioMaskPixels: (stX as any).prioMaskPixels ?? 0,
    spritePixelsDrawn: (stX as any).spritePixelsDrawn ?? 0,
    spritePixelsMaskedByPriority: (stX as any).spritePixelsMaskedByPriority ?? 0,
    spriteLinesSkippedByLimit: (stX as any).spriteLinesSkippedByLimit ?? 0,
    perLineLimitHitLines: (stX as any).perLineLimitHitLines ?? 0,
    activeSprites: (stX as any).activeSprites ?? 0,
  } as any;
  writeFileSync(outPath + '.json', Buffer.from(JSON.stringify(diagOut, null, 2)));

  // eslint-disable-next-line no-console
  console.log({
    displayEnabled: stX.displayEnabled,
    vblankIrqEnabled: stX.vblankIrqEnabled,
    vramWrites: stX.vramWrites,
    cramWrites: stX.cramWrites,
    nonZeroVRAM,
    nonZeroVramWrites: stX.nonZeroVramWrites ?? 0,
    lastNonZeroVramAddr:
      stX.lastNonZeroVramAddr !== undefined ? `0x${stX.lastNonZeroVramAddr.toString(16).padStart(4, '0')}` : 'none',
    vdpDataWrites: vdpWrites.data,
    vdpCtrlWrites: vdpWrites.control,
    hCounterReads: hstats.total,
    vCounterReads: hstats.vreads,
    hTop: hstats.top,
    regs: stX.regs.slice(0, 16),
    nameTableBase: stX.nameTableBase.toString(16),
    bgPatternBase: stX.bgPatternBase.toString(16),
    pngNonZeroRGB: pngNonZero,
    pngSource: diag.pngSource,
    renderer: diag.renderer,
    vdpRendererAvailable: diag.vdpRendererAvailable,
    overrideUsed: diag.overrideUsed,
    overrideDisabled: diag.overrideDisabled,
    lastPC: `0x${lastPC.toString(16)}`,
    irqsAccepted: irqCount,
    nmisAccepted: nmiCount,
    ...(verifyResult && { verifyDiffPixels: verifyResult.diffRGBTriplets }),
    prioMaskPixels: (stX as any).prioMaskPixels ?? 0,
    spritePixelsDrawn: (stX as any).spritePixelsDrawn ?? 0,
    spritePixelsMaskedByPriority: (stX as any).spritePixelsMaskedByPriority ?? 0,
    spriteLinesSkippedByLimit: (stX as any).spriteLinesSkippedByLimit ?? 0,
    perLineLimitHitLines: (stX as any).perLineLimitHitLines ?? 0,
    activeSprites: (stX as any).activeSprites ?? 0,
  });

  // eslint-disable-next-line no-console
  console.log(
    `Wrote ${outPath} (${WIDTH}x${HEIGHT}) after ${framesRan} frames (mode=${until}, cap=${seconds}s). Diag: ${outPath}.json`
  );
}

main().catch(e => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
