#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';

// Build a tiny Z80 ROM that programs a 3-note chord on the SN76489 (port 0x7F)
// Channels: C4 (261.63 Hz), E4 (329.63 Hz), G4 (392.00 Hz)
// Uses proper tone latch + data-only writes to set 10-bit periods, then unmutes volumes.
// Loops forever.

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

// Helper to program a tone channel N (10-bit) via latch(low4) + data(high6)
const programTone = (rom: Uint8Array, pcRef: { pc: number }, ch: 0|1|2, N: number): void => {
  const w = (b: number): void => { rom[pcRef.pc++] = b & 0xFF; };
  const lowNib = (N & 0x0F) >>> 0;
  const hi6 = (N >>> 4) & 0x3F;
  const latch = 0x80 | ((ch & 0x03) << 5) | 0x00 | lowNib; // tone latch
  // Latch low nibble
  w(OP.LD_A_IMM); w(latch);
  w(OP.OUT_IMM_A); w(0x7F);
  // Data-only high 6 bits
  w(OP.LD_A_IMM); w(hi6);
  w(OP.OUT_IMM_A); w(0x7F);
};

async function main(): Promise<void> {
  const bankSize = 0x4000;
  const rom = new Uint8Array(bankSize * 3); // 48KB
  const pcRef = { pc: 0x0000 };
  const w = (b: number): void => { rom[pcRef.pc++] = b & 0xFF; };

  // Disable interrupts
  w(OP.DI);

  // Periods N = round(3579545 / (32 * f))
  const N_C4 = 0x1AB; // ~261.6 Hz
  const N_E4 = 0x153; // ~329.6 Hz
  const N_G4 = 0x11D; // ~392.0 Hz

  // Program tones on channels 0,1,2
  programTone(rom, pcRef, 0, N_C4);
  programTone(rom, pcRef, 1, N_E4);
  programTone(rom, pcRef, 2, N_G4);

  // Unmute volumes (0 = loudest)
  // ch0 volume
  w(OP.LD_A_IMM); w(0x90 | 0x00); // latch vol ch0 = 0
  w(OP.OUT_IMM_A); w(0x7F);
  // ch1 volume
  w(OP.LD_A_IMM); w(0xB0 | 0x00); // latch vol ch1 = 0
  w(OP.OUT_IMM_A); w(0x7F);
  // ch2 volume
  w(OP.LD_A_IMM); w(0xD0 | 0x00); // latch vol ch2 = 0
  w(OP.OUT_IMM_A); w(0x7F);

  // Simple delay loop forever to keep the chord sounding
  const loopAddr = pcRef.pc;
  for (let i = 0; i < 32; i++) w(OP.NOP);
  w(OP.JP); pcRef.pc = emit16(rom, pcRef.pc, loopAddr);

  const outDir = path.resolve('out');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'psg_chord.sms');
  await fs.writeFile(outPath, rom);
  console.log(`Wrote ${outPath} (${rom.length} bytes)`);
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
