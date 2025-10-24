#!/usr/bin/env tsx
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { createMachine } from '../src/machine/machine.js';

const crc32 = (buf: Uint8Array): number => {
  let c = ~0 >>> 0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]!; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
  return ~c >>> 0;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const len = data.length >>> 0; const out = new Uint8Array(8 + len + 4); const dv = new DataView(out.buffer);
  dv.setUint32(0, len, false); out[4]=type.charCodeAt(0); out[5]=type.charCodeAt(1); out[6]=type.charCodeAt(2); out[7]=type.charCodeAt(3);
  out.set(data,8); const crcBuf = new Uint8Array(4+len); crcBuf[0]=out[4]; crcBuf[1]=out[5]; crcBuf[2]=out[6]; crcBuf[3]=out[7]; crcBuf.set(data,4);
  dv.setUint32(8+len, crc32(crcBuf)>>>0, false); return out;
};
const toPNG = (w:number,h:number,rgb:Uint8Array):Uint8Array => { const sig=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const ihdr=new Uint8Array(13); const dv=new DataView(ihdr.buffer); dv.setUint32(0,w,false); dv.setUint32(4,h,false); ihdr[8]=8; ihdr[9]=2;
  const IHDR=chunk('IHDR', ihdr); const stride=w*3; const raw=new Uint8Array((stride+1)*h);
  for(let y=0;y<h;y++){ raw[y*(stride+1)]=0; raw.set(rgb.subarray(y*stride, (y+1)*stride), y*(stride+1)+1); }
  const IDAT=chunk('IDAT', zlib.deflateSync(raw)); const IEND=chunk('IEND', new Uint8Array(0));
  const out=new Uint8Array(sig.length+IHDR.length+IDAT.length+IEND.length); out.set(sig,0); out.set(IHDR,sig.length); out.set(IDAT,sig.length+IHDR.length); out.set(IEND,sig.length+IHDR.length+IDAT.length); return out;
};

(async () => {
  const root = process.cwd();
  const romPath = process.env.WONDERBOY_SMS_ROM || join(root,'wonderboy5.sms');
  const biosPath = process.env.SMS_BIOS_ROM || join(root,'mame-roms/sms/mpr-12808.ic2');
  if (!existsSync(romPath)) { console.error(`ROM missing: ${romPath}`); process.exit(1); }
  const rom = new Uint8Array(readFileSync(romPath));
  const bios = existsSync(biosPath) ? new Uint8Array(readFileSync(biosPath)) : null;
  console.log('BIOS present:', !!bios, biosPath);
  const m = createMachine({ cart: { rom }, useManualInit: bios ? false : true, bus: { bios }});
  const vdp = m.getVDP();
  const s0 = vdp.getState?.();
  const cpf = (s0?.cyclesPerLine ?? 228) * (s0?.linesPerFrame ?? 262);

  // Instrument I/O
  const ioCounts = new Map<number, number>();
  const ioReadCounts = new Map<number, number>();
  const cpu = m.getCPU();
  // Monkey-patch debug hooks by wrapping machine (we can't replace after creation, so use tools/trace_io.ts approach)
  // Instead, we wrap bus methods for counting reads
  const bus = m.getBus();
  const origReadIO8 = (bus as any).readIO8.bind(bus);
  let statusLogLeft = 24;
  let statusLogLines = 0;
  let statusWithVBlank = 0;
  (bus as any).readIO8 = (port: number): number => {
    const p = port & 0xff;
    const v = origReadIO8(port) & 0xff;
    ioReadCounts.set(p, (ioReadCounts.get(p) ?? 0) + 1);
    if (p === 0xbf && statusLogLeft > 0) {
      statusLogLeft--;
      statusLogLines++;
      if (v & 0x80) statusWithVBlank++;
      if (statusLogLines <= 8) console.log(`STATUS rd #${statusLogLines}: v=0x${v.toString(16).padStart(2,'0')} ${(v&0x80)?'(VBLK)': ''}`);
    }
    return v;
  };

  const origWriteIO8 = (bus as any).writeIO8.bind(bus);
  (bus as any).writeIO8 = (port: number, val: number): void => {
    const p = port & 0xff;
    ioCounts.set(p, (ioCounts.get(p) ?? 0) + 1);
    return origWriteIO8(port, val);
  };

  // Decode VDP register writes by latching control writes
  const origVDPWrite = vdp.writePort.bind(vdp);
  let latch: number | null = null;
  const regWriteCounts = new Map<number, number>();
  vdp.writePort = (port: number, val: number): void => {
    const p = port & 0xff;
    const v = val & 0xff;
    if (p === 0xbf) {
      if (latch === null) {
        latch = v;
      } else {
        const low = latch;
        const high = v;
        latch = null;
        const code = (high >>> 6) & 0x03;
        if (code === 0x02) {
          const reg = high & 0x0f;
          regWriteCounts.set(reg, (regWriteCounts.get(reg) ?? 0) + 1);
        }
      }
    }
    return origVDPWrite(port, val);
  };

  // Run up to 600 frames, log when R1 changes
  let lastR1 = vdp.getRegister?.(1) ?? 0;
  for (let i=1;i<=600;i++) {
    m.runCycles(cpf);
    const r1 = vdp.getRegister?.(1) ?? 0;
    if (r1 !== lastR1) {
      console.log(`Frame ${i}: R1 changed -> 0x${r1.toString(16).padStart(2,'0')}, display=${(r1 & 0x40) ? 'ON':'OFF'}`);
      lastR1 = r1;
    }
  }
  const s = vdp.getState?.();
  console.log('VDP after 600f: display=', s?.displayEnabled, 'line=', s?.line, 'R1=', vdp.getRegister?.(1)?.toString(16), 'R7=', vdp.getRegister?.(7)?.toString(16));
  if (s) console.log('VRAM writes:', s.vramWrites, 'CRAM writes:', s.cramWrites, 'lastCRAM idx:', s.lastCramIndex, 'val:', s.lastCramValue);
  // Also dump bus VDP write stats
  const stats = (m.getBus()).getVDPWriteStats();
  console.log('Bus VDP writes: data=', stats.data, 'control=', stats.control);
  const fb = vdp.renderFrame?.();
  if (!fb) { console.error('renderFrame null'); process.exit(2); }
  let nonBlack=0; for (let i=0;i<fb.length;i+=3){ if (fb[i]||fb[i+1]||fb[i+2]) nonBlack++; }
  console.log('nonBlack pixels:', nonBlack, 'of', 256*192);
  const outDir = join(root,'out'); try{ mkdirSync(outDir,{recursive:true}); }catch{}
  writeFileSync(join(outDir,'wb_120_debug.png'), toPNG(256,192, fb));
  console.log('wrote out/wb_120_debug.png');

  // Dump IO stats
  const top = (m: Map<number,number>) => Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).slice(0,16).map(([p,c])=>`0x${p.toString(16).padStart(2,'0')}=${c}`).join(', ');
  console.log('IO writes top:', top(ioCounts));
  console.log('IO reads top:', top(ioReadCounts));
  console.log('VDP reg writes:', Array.from(regWriteCounts.entries()).map(([r,c])=>`R${r}=${c}`).join(', ') || 'none');
})();

