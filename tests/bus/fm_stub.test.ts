import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const makeCart = (banks: number): Cartridge => ({ rom: new Uint8Array(banks * 0x4000) });

describe('FM stub ports (0xF0-0xF2)', (): void => {
  it('reads return 0xFF and writes to 0xF2 are accepted', (): void => {
    const bus = new SmsBus(makeCart(1), null as any, null as any);
    // Reads should return open-bus style 0xFF
    expect(bus.readIO8(0xf2)).toBe(0xff);
    expect(bus.readIO8(0xf0)).toBe(0xff);
    expect(bus.readIO8(0xf1)).toBe(0xff);
    // Writes should not throw; 0xF2 modifies internal flag only
    bus.writeIO8(0xf2, 0x80);
    bus.writeIO8(0xf2, 0x00);
    bus.writeIO8(0xf0, 0x12);
    bus.writeIO8(0xf1, 0x34);
    // Follow-up read still returns 0xFF
    expect(bus.readIO8(0xf2)).toBe(0xff);
  });
});

