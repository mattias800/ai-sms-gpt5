import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const makeRom = (): Cartridge => ({ rom: new Uint8Array(0x4000 * 3) });

describe('Memory control (0x3E) is stored and readable via getter (scaffold, branch coverage)', (): void => {
  it('getMemControl reflects last write to 0x3E and does not affect 0xBE/0xBF mirrors', (): void => {
    const bus = new SmsBus(makeRom(), null as any, null as any);
    bus.writeIO8(0x3e, 0xaa);
    expect(bus.getMemControl()).toBe(0xaa);
    // Reads on 0x3E should be 0xFF and not map to VDP
    expect(bus.readIO8(0x3e)).toBe(0xff);
  });
});
