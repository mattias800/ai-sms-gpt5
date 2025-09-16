import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';

// Minimal 16KB ROM of NOPs
const makeRom = (size = 0x4000): Uint8Array => new Uint8Array(size);

describe('Machine API smoke', () => {
  it('exposes CPU/VDP/PSG/Bus/Controllers and debug stats; runCycles ticks subsystems', () => {
    const cart = { rom: makeRom() };
    const m = createMachine({ cart });

    // Accessors exist
    const cpu = m.getCPU();
    const vdp = m.getVDP();
    const psg = m.getPSG();
    const bus = m.getBus();
    const pad1 = m.getController1();
    const pad2 = m.getController2();

    expect(cpu.getState().pc).toBeTypeOf('number');
    expect(typeof vdp.hasIRQ()).toBe('boolean');
    expect(psg.getState().vols.length).toBe(4);

    // Controller API
    pad1.setState({ left: true, button1: true });
    expect(pad1.readPort()).toBeTypeOf('number');
    pad2.reset();

    // Run some cycles to tick VDP/PSG/CPU paths
    m.runCycles(1000);

    // Bus debug helpers
    const hcStats = bus.getHCounterStats();
    expect(hcStats).toHaveProperty('total');
    const vdpStats = bus.getVDPWriteStats();
    expect(vdpStats).toHaveProperty('data');

    // Machine debug stats
    const dbg = m.getDebugStats();
    expect(dbg).toHaveProperty('irqAccepted');
    expect(dbg).toHaveProperty('pc');
  });
});
