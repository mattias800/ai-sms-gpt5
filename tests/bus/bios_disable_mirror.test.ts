import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const makeCart = (banks: number): Cartridge => {
  const rom = new Uint8Array(banks * 0x4000);
  // Sentinel bytes to distinguish ROM vs BIOS mapping
  // Put 0xAA at 0x0000 in ROM bank0 and 0xBB at 0x8000 in slot2
  rom[0x0000] = 0xaa;
  if (rom.length >= 0xC000) rom[0x8000] = 0xbb;
  return { rom };
};

const makeBios = (size: number): Uint8Array => {
  const bios = new Uint8Array(size);
  // Distinct sentinel for BIOS mapping at 0x0000 and 0x8000
  bios[0x0000] = 0x11;
  if (size > 0x8000) bios[0x8000] = 0x22;
  return bios;
};

describe('BIOS overlay control: port 0x3E bit2 and 0xFFFC bit2 mirror (one-way disable)', (): void => {
  it('enables BIOS overlay at reset; disable is one-way via 0x3E bit2 or 0xFFFC bit2 and cannot be re-enabled', (): void => {
    const cart = makeCart(4);
    const bios = makeBios(0x4000); // 16KB BIOS
    const bus = new SmsBus(cart, null as any, null as any, null as any, null as any, { allowCartRam: true, bios });

    // At reset, BIOS is enabled: reads below 0xC000 should come from BIOS
    expect(bus.read8(0x0000)).toBe(0x11); // BIOS sentinel

    // Disable via 0xFFFC mirror bit2 set
    bus.write8(0xfffc, 0x04);
    expect(bus.read8(0x0000)).toBe(0xaa); // ROM sentinel now visible

    // Attempt to re-enable by clearing bit2 on 0xFFFC should have no effect
    bus.write8(0xfffc, 0x00);
    expect(bus.read8(0x0000)).toBe(0xaa);

    // Now, even via port 0x3E clearing bit2 should not re-enable
    bus.writeIO8(0x3e, 0x00);
    expect(bus.read8(0x0000)).toBe(0xaa);

    // If BIOS were still enabled initially, writing 0x3E with bit2 set must disable (idempotent)
    bus.writeIO8(0x3e, 0x04);
    expect(bus.read8(0x0000)).toBe(0xaa);
  });
});
