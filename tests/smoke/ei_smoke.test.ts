import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';
import type { TraceEvent } from '../../src/cpu/z80/z80.js';

// EI/IFF1/IRQ smoke: run Sonic with BIOS for up to ~3 seconds (180 frames) and
// assert that EI executes at least once, IFF1 becomes true at least once, and
// at least one IRQ is accepted. Break early as soon as conditions are met.

describe('Z80 EI/IFF1/IRQ smoke (Sonic + BIOS)', (): void => {
  it('observes EI opcode, IFF1 rising edge, and an IRQ acceptance', async (): Promise<void> => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, 'sonic.sms');
    const biosPath = path.join(ROOT, 'bios13fx.sms');

    await expect(fs.access(romPath)).resolves.not.toThrow();
    await expect(fs.access(biosPath)).resolves.not.toThrow();

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

    let eiCount = 0;
    let iff1Rises = 0;
    let irqAccepted = 0;
    let lastIFF1 = false;

    const m = createMachine({
      cart: { rom },
      bus: { allowCartRam: true, bios },
      fastBlocks: false,
      trace: {
        onTrace: (ev: TraceEvent): void => {
          if (ev.opcode === 0xfb) eiCount++;
          // Observe IFF1 via CPU state (rising edge)
          const st = m.getCPU().getState();
          const cur = !!st.iff1;
          if (!lastIFF1 && cur) iff1Rises++;
          lastIFF1 = cur;
          if (ev.irqAccepted) irqAccepted++;
        },
        traceDisasm: false,
        traceRegs: false,
      },
    });

    const vdp = m.getVDP();
    const cyclesPerFrame = (vdp.getState?.()?.cyclesPerLine ?? 228) * (vdp.getState?.()?.linesPerFrame ?? 262);

    // Run up to 180 frames (~3 seconds); break early if all conditions met
    const maxFrames = 180;
    for (let f = 0; f < maxFrames; f++) {
      m.runCycles(cyclesPerFrame);
      if (eiCount > 0 && iff1Rises > 0 && irqAccepted > 0) break;
    }

    expect(eiCount).toBeGreaterThan(0);
    expect(iff1Rises).toBeGreaterThan(0);
    expect(irqAccepted).toBeGreaterThan(0);
  }, 30000);
});

