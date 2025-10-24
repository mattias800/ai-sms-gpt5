#!/usr/bin/env tsx
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { createMachine } from '../src/machine/machine.js';

const crc32 = (buf: Uint8Array): number => { let c = ~0 >>> 0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]!; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return ~c >>> 0; };
const pngChunk = (type: string, data: Uint8Array): Uint8Array => { const len = data.length >>> 0; const out = new Uint8Array(8 + len + 4); const dv = new DataView(out.buffer); dv.setUint32(0, len, false); out[4]=type.charCodeAt(0); out[5]=type.charCodeAt(1); out[6]=type.charCodeAt(2); out[7]=type.charCodeAt(3); out.set(data,8); const crcBuf=new Uint8Array(4+len); crcBuf[0]=out[4]; crcBuf[1]=out[5]; crcBuf[2]=out[6]; crcBuf[3]=out[7]; crcBuf.set(data,4); dv.setUint32(8+len, crc32(crcBuf)>>>0, false); return out; };
const encodePNG = (w:number,h:number,rgb:Uint8Array):Uint8Array => { const sig=Uint8Array.from([137,80,78,71,13,10,26,10]); const ihdr=new Uint8Array(13); const dv=new DataView(ihdr.buffer); dv.setUint32(0,w,false); dv.setUint32(4,h,false); ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0; const IHDR=pngChunk('IHDR', ihdr); const stride=w*3; const raw=new Uint8Array((stride+1)*h); for (let y=0;y<h;y++){ raw[y*(stride+1)]=0; raw.set(rgb.subarray(y*stride,(y+1)*stride), y*(stride+1)+1);} const IDAT=pngChunk('IDAT', zlib.deflateSync(raw)); const IEND=pngChunk('IEND', new Uint8Array(0)); const out=new Uint8Array(sig.length+IHDR.length+IDAT.length+IEND.length); out.set(sig,0); out.set(IHDR,sig.length); out.set(IDAT,sig.length+IHDR.length); out.set(IEND,sig.length+IHDR.length+IDAT.length); return out; };

const setVDPReg = (vdp: any, idx: number, val: number): void => { vdp.writePort(0xbf, val & 0xff); vdp.writePort(0xbf, 0x80 | (idx & 0x0f)); };
const setCRAM = (vdp: any, idx: number, val: number): void => { vdp.writePort(0xbf, idx & 0xff); vdp.writePort(0xbf, 0xc0); vdp.writePort(0xbe, val & 0x3f); };

(async () => {
  const root = process.cwd();
  const romPath = process.env.WONDERBOY_SMS_ROM || join(root,'wonderboy5.sms');
  const biosPath = process.env.SMS_BIOS_ROM || join(root,'mame-roms/sms/mpr-12808.ic2');
  if (!existsSync(romPath)) { console.error('ROM missing:', romPath); process.exit(1); }
  const rom = new Uint8Array(readFileSync(romPath));
  const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;
  const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios }});
  const vdp = m.getVDP();
  const st0 = vdp.getState?.();
  const cpf = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);

  // Run 120 frames with BIOS
  for (let i=0;i<120;i++) m.runCycles(cpf);

  let s = vdp.getState?.();
  console.log('Before force: display=', s?.displayEnabled, 'R1=', s?.regs?.[1]?.toString(16), 'R7=', s?.regs?.[7]?.toString(16), 'cramWrites=', s?.cramWrites);

  // If still blank, force a visible light-blue background safely
  // CRAM encoding: 00BBGGRR; pick RR=0, GG=3, BB=3 => 0x3C (light blue/teal-ish)
  const LIGHT_BLUE = 0x3c;
  if (!s?.displayEnabled || (s?.cramWrites ?? 0) === 0) {
    setCRAM(vdp, 0, LIGHT_BLUE);
    // Set R7 to 0 (use CRAM[0] as backdrop)
    setVDPReg(vdp, 7, 0x00);
    // Enable display (preserve other bits)
    const r1 = (vdp.getRegister(1) ?? 0) | 0x40;
    setVDPReg(vdp, 1, r1 & 0xff);
  }

  s = vdp.getState?.();
  const fb = vdp.renderFrame?.();
  if (!fb) { console.error('renderFrame null'); process.exit(2); }

  // Measure blue dominance
  let total=0, blueish=0; for (let i=0;i<fb.length;i+=3){ const r=fb[i], g=fb[i+1], b=fb[i+2]; total++; if (b>=g && g>=r && (b>0 || g>0)) blueish++; }
  const share = blueish / total;
  console.log(`After force: display=${s?.displayEnabled} R1=0x${(s?.regs?.[1]??0).toString(16)} R7=0x${(s?.regs?.[7]??0).toString(16)} blueishShare=${(share*100).toFixed(2)}%`);

  const outDir = join(root,'out'); try { mkdirSync(outDir, { recursive: true }); } catch {}
  const png = encodePNG(256,192, fb);
  const outPath = join(outDir, 'forced_blue.png');
  writeFileSync(outPath, png);
  console.log('Wrote', outPath);
})();
