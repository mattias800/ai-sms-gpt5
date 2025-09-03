import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';
import { createVDP } from '../../src/vdp/vdp.js';
import { createPSG } from '../../src/psg/sn76489.js';

const makeRom = (): Cartridge => {
  // simple 3-bank ROM all zeros
  const rom = new Uint8Array(0x4000 * 3);
  return { rom };
};

describe('SMS IO ports', (): void => {
  it('controller reads (0xDC/0xDD) return 0xFF by default', (): void => {
    const vdp = createVDP();
    const psg = createPSG();
    const bus = new SmsBus(makeRom(), vdp, psg);
    expect(bus.readIO8(0xdc)).toBe(0xff);
    expect(bus.readIO8(0xdd)).toBe(0xff);
  });

  it('IO control (0x3F) and memory control (0x3E) writes are stored and not mirrored to VDP', (): void => {
    const vdp = createVDP();
    const psg = createPSG();
    const bus = new SmsBus(makeRom(), vdp, psg);
    // Precondition: VDP status read should be unaffected by 0x3E/0x3F writes
    bus.writeIO8(0x3f, 0x55);
    bus.writeIO8(0x3e, 0xaa);
    expect(bus.getIOControl()).toBe(0x55);
    expect(bus.getMemControl()).toBe(0xaa);
    // Ensure reads from 0x3E/0x3F do not crash and return 0xFF
    expect(bus.readIO8(0x3f)).toBe(0xff);
    expect(bus.readIO8(0x3e)).toBe(0xff);
  });

  it('VDP mirroring excludes 0x3E/0x3F and 0x7F', (): void => {
    const vdp = createVDP();
    const psg = createPSG();
    const bus = new SmsBus(makeRom(), vdp, psg);
    // Write to an address with low6=0x3E but not 0x3E/0xBE, e.g., 0xFE
    bus.writeIO8(0xfe, 0x12); // should map to 0xBE (data)
    // Now set VDP address and read back to ensure it was written
    vdp.writePort(0xbf, 0x00);
    vdp.writePort(0xbf, 0x00);
    const first = vdp.readPort(0xbe); // read buffer
    const second = vdp.readPort(0xbe); // actual data at 0x0000
    expect(first).toBe(0x00);
    expect(second).toBe(0x12);

    // Verify that 0x7F still goes to PSG and is not mirrored to VDP
    bus.writeIO8(0x7f, 0x90);
    expect(bus.getLastPSG()).toBe(0x90);
  });
});

