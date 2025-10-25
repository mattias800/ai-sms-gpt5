import { describe, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic PSG writes debug', () => {
  it('logs all PSG port writes during first 3 seconds', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      console.log('[sonic_psg_debug] Skipping: sonic.sms not found');
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();
    const bus = m.getBus();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const frames = 180; // 3 seconds at 60 FPS

    // Patch bus writeIO8 to log PSG writes
    const originalWriteIO8 = bus.writeIO8.bind(bus);
    const psgWrites: Array<{ port: number; val: number; frame: number }> = [];
    let currentFrame = 0;

    bus.writeIO8 = (port: number, val: number): void => {
      // PSG is at ports 0x7E and 0x7F
      if ((port & 0xff) === 0x7e || (port & 0xff) === 0x7f) {
        psgWrites.push({ port, val, frame: currentFrame });
      }
      return originalWriteIO8(port, val);
    };

    // Run emulator
    for (let frame = 0; frame < frames; frame++) {
      currentFrame = frame;
      let cyclesToRun = cyclesPerFrame;
      while (cyclesToRun > 0) {
        const { cycles } = cpu.stepOne();
        cyclesToRun -= cycles;
      }
    }

    // Analyze writes
    console.log(`[sonic_psg_debug] Total PSG writes: ${psgWrites.length}`);
    
    if (psgWrites.length === 0) {
      console.log(`[sonic_psg_debug] ❌ NO PSG WRITES AT ALL during 3 seconds`);
      console.log(`[sonic_psg_debug] This means Sonic's audio driver is not running`);
      return;
    }

    // Group by frame and port
    const writesByFrame = new Map<number, Array<{ port: number; val: number }>>();
    for (const w of psgWrites) {
      if (!writesByFrame.has(w.frame)) writesByFrame.set(w.frame, []);
      writesByFrame.get(w.frame)!.push({ port: w.port, val: w.val });
    }

    // Show writes per frame
    console.log(`[sonic_psg_debug] Frames with PSG activity:`);
    for (const [frame, writes] of Array.from(writesByFrame.entries()).slice(0, 20)) {
      const portStr = writes.map(w => `0x${w.port.toString(16)}:0x${w.val.toString(16)}`).join(', ');
      console.log(`[sonic_psg_debug]   Frame ${frame}: ${portStr}`);
    }

    // Show ALL volume writes (bit 4 set means volume register)
    const volumeWrites = psgWrites.filter(w => (w.val & 0x80) && (w.val & 0x10));
    console.log(`[sonic_psg_debug] Total volume writes: ${volumeWrites.length}`);
    
    // Group volume writes by value
    const volByValue = new Map<number, number>();
    for (const w of volumeWrites) {
      const vol = w.val & 0x0f;
      volByValue.set(vol, (volByValue.get(vol) ?? 0) + 1);
    }
    
    console.log(`[sonic_psg_debug] Volume values written:`);
    for (const [vol, count] of Array.from(volByValue.entries()).sort((a, b) => a[0] - b[0])) {
      const unmuted = vol < 0xf ? '✓ UNMUTED' : '✗ MUTED';
      console.log(`[sonic_psg_debug]   0x${vol.toString(16)}: ${count} times ${unmuted}`);
    }

    // Check for volume unmutes (values with lower 4 bits < 0xF)
    const unmuteWrites = volumeWrites.filter(w => (w.val & 0x0f) < 0xf);

    if (unmuteWrites.length > 0) {
      console.log(`[sonic_psg_debug] ✓ ${unmuteWrites.length} UNMUTE commands found`);
    } else {
      console.log(`[sonic_psg_debug] ❌ NO UNMUTE commands - all volumes stay muted (0xF)`);
    }
  }, 120000);
});
