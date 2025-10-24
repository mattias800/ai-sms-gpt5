import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';

/**
 * Comprehensive PSG write trace including ALL writes, not just volumes
 * Goal: Find EVERY PSG write and determine if unmute commands exist anywhere
 */

const main = async () => {
  console.log('=== COMPREHENSIVE PSG WRITE TRACE ===\n');

  const rom = new Uint8Array((await fs.readFile('./sonic.sms')).buffer);
  const m = createMachine({ cart: { rom }, bus: { allowCartRam: true } });
  const cpu = m.getCPU();
  const bus = m.getBus();

  const psgWrites: any[] = [];
  const originalWrite = bus.writeIO8.bind(bus);

  bus.writeIO8 = (port: number, val: number) => {
    if ((port & 0xff) === 0x7f || (port & 0xff) === 0xff) {
      const state = cpu.getState();
      const v = val & 0xff;

      // Decode PSG command type
      let cmdType = 'UNKNOWN';
      let details = '';

      if (v & 0x80) {
        // Latch command
        const ch = (v >> 5) & 0x03;
        const cmdBits = (v >> 4) & 0x01;

        if (cmdBits === 0) {
          // Tone frequency (bits 3-0 are high bits)
          cmdType = `TONE-HI-CH${ch}`;
          details = `vol_attn=${v & 0x0f}`;
        } else {
          // Volume/Attenuation
          const vol = v & 0x0f;
          cmdType = `VOL-CH${ch}`;
          details = `vol=${vol} (${vol === 15 ? 'MUTED' : 'AUDIBLE'})`;
        }
      } else {
        // Data byte (continues previous latch)
        cmdType = 'TONE-LO';
        details = `freq_low=${v}`;
      }

      psgWrites.push({
        pc: state.pc & 0xffff,
        val: v,
        cmdType,
        details,
      });
    }
    return originalWrite(port, val);
  };

  // Run for many frames
  const FRAME_CYCLES = 228 * 262;
  let cyclesExecuted = 0;
  const targetFrames = 30;

  console.log('Running 30 frames to capture all PSG activity...\n');

  while (cyclesExecuted < FRAME_CYCLES * targetFrames) {
    const { cycles } = cpu.stepOne();
    cyclesExecuted += cycles;
  }

  // Group by PC
  const byPc = new Map<number, any[]>();
  for (const w of psgWrites) {
    if (!byPc.has(w.pc)) byPc.set(w.pc, []);
    byPc.get(w.pc)!.push(w);
  }

  console.log(`=== TOTAL PSG WRITES: ${psgWrites.length} ===\n`);

  // Show unique write locations
  console.log('Writes grouped by PC:');
  for (const [pc, writes] of [...byPc.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`\n  PC=0x${pc.toString(16).padStart(4, '0')}: ${writes.length} writes`);
    for (const w of writes.slice(0, 3)) {
      console.log(`    ${w.cmdType}: ${w.details}`);
    }
    if (writes.length > 3) {
      console.log(`    ... and ${writes.length - 3} more`);
    }
  }

  // Find unmute commands
  const unmutes = psgWrites.filter(w => w.cmdType.startsWith('VOL-') && !w.details.includes('MUTED'));
  console.log(`\n=== UNMUTE COMMANDS ===`);
  if (unmutes.length === 0) {
    console.log('❌ NO UNMUTE COMMANDS FOUND in 30 frames!');
    console.log('\nThis means:');
    console.log('1. Sonic never unmutes audio during first 30 frames');
    console.log('2. Audio driver either:');
    console.log('   a) Never gets called');
    console.log('   b) Waits for user input or game event to unmute');
    console.log('   c) Uses a different mechanism (frequency only, no volume change)');
  } else {
    console.log(`✅ Found ${unmutes.length} unmute commands:`);
    for (const u of unmutes.slice(0, 10)) {
      console.log(`  PC=0x${u.pc.toString(16).padStart(4, '0')}: ${u.details}`);
    }
  }

  // Show PC locations for volume writes
  console.log(`\n=== VOLUME WRITE LOCATIONS ===`);
  const volWrites = psgWrites.filter(w => w.cmdType.startsWith('VOL-'));
  const volPcs = new Set(volWrites.map(w => w.pc));
  console.log(`Volume writes from ${volPcs.size} unique PCs:`);
  for (const pc of [...volPcs].sort((a, b) => a - b)) {
    const writes = volWrites.filter(w => w.pc === pc);
    const muted = writes.filter(w => w.details.includes('MUTED')).length;
    const audible = writes.filter(w => w.details.includes('AUDIBLE')).length;
    console.log(`  PC=0x${pc.toString(16).padStart(4, '0')}: ${muted} muted, ${audible} audible`);
  }
};

main().catch(console.error);
