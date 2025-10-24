import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const WIDTH = 256;
const HEIGHT = 192;

const encodePNG = async (width: number, height: number, rgb: Uint8Array): Promise<Uint8Array> => {
  const zlib = await import('zlib');
  const sig = Uint8Array.from([137,80,78,71,13,10,26,10]);
  const writeChunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(8 + data.length + 4);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length >>> 0, false);
    out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1); out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3);
    out.set(data, 8);
    const crcData = new Uint8Array(4 + data.length); crcData.set(out.subarray(4,8),0); crcData.set(data,4);
    let c = ~0 >>> 0; for (let i=0;i<crcData.length;i++){ c ^= crcData[i]!; for (let k=0;k<8;k++){ c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; } } c = ~c >>> 0;
    dv.setUint32(8 + data.length, c >>> 0, false);
    return out;
  };
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width, false); dv.setUint32(4, height, false); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const stride = width*3; const raw = new Uint8Array((stride+1)*height);
  for(let y=0;y<height;y++){ raw[y*(stride+1)] = 0; raw.set(rgb.subarray(y*stride,y*stride+stride), y*(stride+1)+1); }
  const compressed = (zlib as any).deflateSync(raw);
  const out = new Uint8Array(sig.length + (8+13+4) + (8+compressed.length+4) + (8+0+4));
  out.set(sig,0);
  out.set(writeChunk('IHDR', ihdr), sig.length);
  out.set(writeChunk('IDAT', compressed), sig.length + (8+13+4));
  out.set(writeChunk('IEND', new Uint8Array(0)), sig.length + (8+13+4) + (8+compressed.length+4));
  return out;
};

const run = async (): Promise<void> => {
  const ROOT = process.cwd();
  const romPath = process.env.SMS_ROM || './sonic.sms';
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 23;
  const out = process.env.OUT || './sprites_dump.png';

  const romBytes = new Uint8Array(await (await fs.readFile(path.isAbsolute(romPath) ? romPath : path.join(ROOT, romPath))).buffer);
  const cart: Cartridge = { rom: romBytes };
  const m = createMachine({ cart });
  const vdp = m.getVDP();

  const st0 = vdp.getState!();
  const cyclesPerFrame = st0.cyclesPerLine * st0.linesPerFrame;
  const frames = Math.floor(60 * seconds);
  for (let f = 0; f < frames; f++) m.runCycles(cyclesPerFrame);

  const st = vdp.getState!();
  const vram = Uint8Array.from(st.vram);
  const regs = st.regs;
  const cram = Uint8Array.from(st.cram);
  const satBase = ((regs[5] ?? 0) & 0x7e) << 7;
  const spritePatternBase = (regs[6] & 0x04) ? 0x2000 : 0x0000;
  const spriteSize = (regs[1] & 0x02) ? 16 : 8;
  const spriteMag = (regs[1] & 0x01) !== 0;
  const sw = spriteMag ? 16 : 8;
  const sh = spriteMag ? spriteSize*2 : spriteSize;

  // Dump first 24 sprites (Y,X,pattern)
  const lines: string[] = [];
  // Dump sprite palette (CRAM indices 16..31)
  const spPal = Array.from({length:16}, (_,i)=> (cram[16+i]??0)&0x3f).map(v=>`0x${v.toString(16).padStart(2,'0')}`).join(' ');
  lines.push(`spritePalette[16..31]=${spPal}`);
  lines.push(`spriteAttrBase=0x${satBase.toString(16)}, spritePatternBase=0x${spritePatternBase.toString(16)}, spriteSize=${spriteSize}, spriteMag=${spriteMag}`);
  for (let i=0;i<24;i++){
    const y = vram[(satBase + i) & 0x3fff] ?? 0;
    const x = vram[(satBase + 128 + i*2) & 0x3fff] ?? 0;
    const pat = vram[(satBase + 128 + i*2 + 1) & 0x3fff] ?? 0;
    lines.push(`${i+1}|spr${i}: Y=${y.toString(16)} X=${x.toString(16)} P=${pat.toString(16)}`);
  }

  // Inspect first up-to-8 visible sprites' pattern bytes (first tile row)
  const visible: { idx:number, y:number, x:number, pn:number }[] = [];
  for (let i=0;i<64;i++){
    const y = vram[(satBase + i) & 0x3fff] ?? 0;
    if (y === 0xD0 || y >= 0xE0) continue;
    const x = vram[(satBase + 128 + i*2) & 0x3fff] ?? 0;
    const pn = vram[(satBase + 128 + i*2 + 1) & 0x3fff] ?? 0;
    visible.push({ idx:i, y, x, pn });
    if (visible.length >= 8) break;
  }
  if (visible.length === 0) {
    lines.push('No visible sprites (all Y>=0xE0 or Y==0xD0).');
  } else {
    lines.push('Visible sprite pattern probe:');
    for (const v of visible){
      const baseNum = spriteSize===16 ? (v.pn & 0xFE) : v.pn;
      const addr = (spritePatternBase + (baseNum<<5)) & 0x3fff;
      const bytes = Array.from(vram.subarray(addr, addr+32)).map(b=>b.toString(16).padStart(2,'0')).join(' ');
      const nonZero = Array.from(vram.subarray(addr, addr+32)).some(b=>b!==0);
      lines.push(`  spr${v.idx}: pn=${v.pn.toString(16)} baseTileAddr=0x${addr.toString(16)} nonZero=${nonZero} bytes=${bytes}`);
    }
  }

  await fs.writeFile((out + '.txt'), lines.join('\n') + '\n', 'utf8');

  // Draw sprites only (ignore BG priority), white-on-black
  const rgb = new Uint8Array(WIDTH*HEIGHT*3);
  let drawnPixels = 0;
  const drawPixel = (x:number,y:number) => { if(x<0||x>=WIDTH||y<0||y>=HEIGHT) return; const o=(y*WIDTH+x)*3; if (rgb[o]!==255||rgb[o+1]!==255||rgb[o+2]!==255){ rgb[o]=255; rgb[o+1]=255; rgb[o+2]=255; drawnPixels++; } };

  let activeSprites = 64; for(let i=0;i<64;i++){ const y=vram[(satBase+i)&0x3fff]; if (y===0xD0){ activeSprites=i; break; } }
  for(let n=0;n<activeSprites;n++){
    let y = vram[(satBase + n) & 0x3fff] ?? 0; if (y>=0xE0) continue; y = (y+1)&0xff;
    const x = vram[(satBase + 128 + n*2) & 0x3fff] ?? 0;
    const pn = vram[(satBase + 128 + n*2 + 1) & 0x3fff] ?? 0;
    const baseNum = spriteSize===16 ? (pn & 0xFE) : pn;
    for(let py=0;py<sh;py++){
      const sy = y + py; if (sy>=HEIGHT) break; if (sy<0) continue;
      for(let px=0;px<sw;px++){
        const sx = x + px; if (sx<0||sx>=WIDTH) continue;
        const tx = spriteMag ? (px>>1) : px; const ty = spriteMag ? (py>>1) : py;
        let tnum = baseNum; let row = ty; if (spriteSize===16 && ty>=8){ tnum = baseNum+1; row = ty-8; }
        const addr = (spritePatternBase + (tnum<<5) + (row<<2)) & 0x3fff;
        const bit = 7 - tx;
        const b0 = (vram[addr]??0)>>bit & 1; const b1 = (vram[addr+1]??0)>>bit & 1; const b2 = (vram[addr+2]??0)>>bit & 1; const b3 = (vram[addr+3]??0)>>bit & 1;
        const ci = b0 | (b1<<1) | (b2<<2) | (b3<<3); if (ci===0) continue;
        drawPixel(sx, sy);
      }
    }
  }

  const png = await encodePNG(WIDTH, HEIGHT, rgb);
  await fs.writeFile(out, png);

  // Also invoke VDP renderer once to collect instrumentation counters from renderFrame()
  if (m.getVDP().renderFrame) {
    m.getVDP().renderFrame();
    const st2 = m.getVDP().getState?.();
    if (st2) {
      lines.push(`vdp.prioMaskPixels=${st2.prioMaskPixels ?? 0}`);
      lines.push(`vdp.spritePixelsDrawn=${st2.spritePixelsDrawn ?? 0}`);
      lines.push(`vdp.spritePixelsMaskedByPriority=${st2.spritePixelsMaskedByPriority ?? 0}`);
      lines.push(`vdp.spriteLinesSkippedByLimit=${st2.spriteLinesSkippedByLimit ?? 0}`);
      lines.push(`vdp.perLineLimitHitLines=${st2.perLineLimitHitLines ?? 0}`);
      lines.push(`vdp.activeSprites=${st2.activeSprites ?? 0}`);
    }
  }

  lines.push(`drawnPixels=${drawnPixels}`);
  await fs.writeFile((out + '.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${out} and ${out}.txt`);
};

run().catch(e=>{ console.error(e?.stack||String(e)); process.exit(1); });
