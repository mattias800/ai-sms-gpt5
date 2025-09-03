import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';
import { createVDP } from '../../src/vdp/vdp.js';
import { createPSG } from '../../src/psg/sn76489.js';

const makeRom = (): Cartridge => ({ rom: new Uint8Array(0x4000 * 3) });

describe('Conservative I/O control scaffolding (0x3F) for controller reads', (): void => {
  it('defaults to 0xFF on 0xDC/0xDD and remains 0xFF when outputs default high', (): void => {
    const vdp = createVDP();
    const psg = createPSG();
    const bus = new SmsBus(makeRom(), vdp, psg);
    // Default
    expect(bus.readIO8(0xdc)).toBe(0xff);
    expect(bus.readIO8(0xdd)).toBe(0xff);
    // Configure outputs via test helper to drive high on some bits; should still read 0xFF
    (bus as any).__setIOMaskForTest(0x3f, 0xff);
    expect(bus.readIO8(0xdc)).toBe(0xff);
    expect(bus.readIO8(0xdd)).toBe(0xff);
  });

  it('when masking drives some lines low, 0xDC/0xDD reflect driven bits and unaffected bits remain pulled-up', (): void => {
    const vdp = createVDP();
    const psg = createPSG();
    const bus = new SmsBus(makeRom(), vdp, psg);
    // Drive lower 2 bits as outputs low
    (bus as any).__setIOMaskForTest(0x03, 0x00);
    expect(bus.readIO8(0xdc) & 0x03).toBe(0x00);
    expect(bus.readIO8(0xdd) & 0x03).toBe(0x00);
    // Non-driven bits remain pulled-up
    expect((bus.readIO8(0xdc) & 0xfc)).toBe(0xfc);
  });
});

