#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';

// Assemble a tiny Z80 program that programs the SN76489 PSG on port 0x7F
// - Set channel 0 volume to loud (0)
// - Set channel 0 tone to a mid frequency (N=0x120 => latch low=0x0, data=0x12)
// - Loop forever
// Writes a 48KB (3 banks) ROM image to out/psg_tone.sms

const OP = {
  DI: 0xF3,
  JP: 0xC3,
  LD_A_IMM: 0x3E,
  OUT_IMM_A: 0xD3,
  NOP: 0x00,
};

const emit16 = (buf: Uint8Array, off: number, val: number): number => {
  buf[off++] = val & 0xFF;
  buf[off++] = (val >>> 8) & 0xFF;
  return off;
};

async function main(): Promise<void> {
  const bankSize = 0x4000;
  const rom = new Uint8Array(bankSize * 3); // 48KB
  let pc = 0x0000;

  const w = (b: number): void => { rom[pc++] = b & 0xFF; };

  // Disable interrupts
  w(OP.DI);

  // Volume ch0 = 0 (0x90 | 0x00)
  w(OP.LD_A_IMM); w(0x90);
  w(OP.OUT_IMM_A); w(0x7F);

  // Tone0 latch low nibble = 0 (0x80 | 0x00)
  w(OP.LD_A_IMM); w(0x80);
  w(OP.OUT_IMM_A); w(0x7F);

  // Tone0 data high 6 bits = 0x12 (N=0x120)
  w(OP.LD_A_IMM); w(0x12);
  w(OP.OUT_IMM_A); w(0x7F);

  // Simple delay loop to keep running
  const loopAddr = pc;
  // NOP sled
  for (let i = 0; i < 16; i++) w(OP.NOP);
  // JP loop
  w(OP.JP); pc = emit16(rom, pc, loopAddr);

  const outDir = path.resolve('out');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'psg_tone.sms');
  await fs.writeFile(outPath, rom);
  console.log(`Wrote ${outPath} (${rom.length} bytes)`);
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });