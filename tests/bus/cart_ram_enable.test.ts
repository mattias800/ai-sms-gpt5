import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const makeRom = (): Cartridge => ({ rom: new Uint8Array(0x4000 * 3) });

describe('Cart RAM mapping via mem control (0x3E): enable/disable read/write', (): void => {
  it('writes to 0x8000-0xBFFF go to cart RAM when enabled and are readable', (): void => {
    const bus = new SmsBus(makeRom(), null as any, null as any);
    // Initially disabled: write should NOT go to cart RAM and read should come from ROM mapping (defaults to 0)
    bus.write8(0x8000, 0x5a);
    expect(bus.read8(0x8000)).toBe(0x00);

    // Enable cart RAM via mem control bit3
    bus.writeIO8(0x3e, 0x08);
    expect(bus.getMemControl() & 0x08).toBe(0x08);

    // Write and read back from 0x8000 region
    bus.write8(0x8000, 0x5a);
    expect(bus.read8(0x8000)).toBe(0x5a);

    // Another address within window
    bus.write8(0xbfff, 0xa5);
    expect(bus.read8(0xbfff)).toBe(0xa5);

    // Disable cart RAM and ensure reads fall back to ROM mapping again (zero)
    bus.writeIO8(0x3e, 0x00);
    expect(bus.read8(0x8000)).toBe(0x00);
  });
});
