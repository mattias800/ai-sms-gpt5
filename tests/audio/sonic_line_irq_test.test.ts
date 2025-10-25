import { describe, it, expect } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import { createMachine } from '../../src/machine/machine.js';

describe('Sonic line IRQ investigation', () => {
  it('checks if excessive IRQs are from line IRQ or VBlank', async () => {
    const ROOT = process.cwd();
    const romPath = path.join(ROOT, './sonic.sms');

    try {
      await fs.access(romPath);
    } catch {
      return;
    }

    const rom = new Uint8Array((await fs.readFile(romPath)).buffer);
    const m = createMachine({ cart: { rom }, useManualInit: true });
    const cpu = m.getCPU();
    const vdp = m.getVDP();

    const CPU_CLOCK_HZ = 3_579_545;
    const cyclesPerFrame = CPU_CLOCK_HZ / 60;
    const frames = 60; // 1 second

    // Track IRQs
    let irqCount = 0;
    const originalRequestIRQ = cpu.requestIRQ.bind(cpu);
    cpu.requestIRQ = () => {
      irqCount++;
      return originalRequestIRQ();
    };

    // Run emulator
    for (let frame = 0; frame < frames; frame++) {
      let cyclesToRun = cyclesPerFrame;
      while (cyclesToRun > 0) {
        const { cycles } = cpu.stepOne();
        cyclesToRun -= cycles;
      }
    }

    const debugStats = m.getDebugStats?.();
    const vdpState = vdp.getState?.();
    console.log(`[line_irq_test] Over 1 second (60 frames):`);
    console.log(`[line_irq_test]   IRQs accepted: ${debugStats?.irqAccepted ?? 'N/A'}`);
    console.log(`[line_irq_test]   IRQs requested: ${irqCount}`);
    console.log(`[line_irq_test]   Expected: ~2 (1 VBlank per frame, occasional line IRQ)`);
    console.log(`[line_irq_test]   R0 (regs[0]): 0x${(vdpState?.regs?.[0] ?? 0).toString(16).padStart(2, '0')} (bit4=${(((vdpState?.regs?.[0] ?? 0) & 0x10) !== 0 ? 'enabled' : 'disabled')})`);    
    console.log(`[line_irq_test]   R10 (lineCounter reload): 0x${(vdpState?.regs?.[10] ?? 0).toString(16).padStart(2, '0')}`);
    console.log(`[line_irq_test]   Current line counter: ${vdpState?.lineCounter ?? 'N/A'}`);
    console.log(`[line_irq_test]   IRQ assert count: ${vdpState?.irqAssertCount ?? 'N/A'}`);
    
    if (irqCount > 120) {
      console.log(`[line_irq_test] ❌ TOO MANY IRQs - Line IRQ likely firing on every scanline`);
    } else if (irqCount > 60) {
      console.log(`[line_irq_test] ⚠ Elevated IRQ count`);
    } else {
      console.log(`[line_irq_test] ✓ Normal IRQ rate`);
    }

    expect(irqCount).toBeLessThan(200);
  }, 120000);
});
