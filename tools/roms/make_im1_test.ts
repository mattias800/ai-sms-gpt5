import { promises as fs } from 'fs';
import path from 'path';

const hex = (n: number) => '0x' + n.toString(16).padStart(2, '0');

async function main() {
  const ROOT = process.cwd();
  const outDir = path.join(ROOT, 'roms');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'im1_test.sms');

  const rom = new Uint8Array(0x10000); rom.fill(0xFF);

  let p = 0x0000;
  rom[p++] = 0xF3;                 // DI
  rom[p++] = 0xED; rom[p++] = 0x56;// IM 1
  rom[p++] = 0x31; rom[p++] = 0xF0; rom[p++] = 0xDF; // LD SP,$DFF0
  rom[p++] = 0xFB;                 // EI
  rom[p++] = 0x76;                 // HALT
  rom[p++] = 0x18; rom[p++] = 0xFE; // JR -2 (tight loop if no IRQ)

  // RST 38h handler at 0x0038
  let q = 0x0038;
  rom[q++] = 0xF5;                 // PUSH AF
  rom[q++] = 0xDB; rom[q++] = 0xBF; // IN A,($BF)  (VDP status)
  rom[q++] = 0x07;                 // RLCA (bit7->carry)
  rom[q++] = 0x32; rom[q++] = 0x00; rom[q++] = 0xC1; // LD ($C100),A (log status)
  rom[q++] = 0xF1;                 // POP AF
  rom[q++] = 0xC9;                 // RET

  await fs.writeFile(outPath, rom);
  console.log(`Wrote ${outPath}`);
}

main().catch(e=>{ console.error(e); process.exit(1); });

