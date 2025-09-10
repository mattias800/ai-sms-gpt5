import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const makeCart = (banks: number): Cartridge => {
  const rom = new Uint8Array(banks * 0x4000);
  // Tag each 16KB bank start with its bank index
  for (let i = 0; i < rom.length; i += 0x4000) rom[i] = (i / 0x4000) & 0xff;
  return { rom };
};

const makeBios = (): Uint8Array => {
  const bios = new Uint8Array(0x4000); // 16KB BIOS
  // Distinct sentinels at 0x0000 and 0x8000
  bios[0x0000] = 0xA1; // overlay area
  // Note: 0x8000 not in BIOS range; if read with overlay incorrectly extended, would mirror to 0x0000
  return bios;
};

describe('BIOS overlay range (0x0000-0x3FFF only)', (): void => {
  it('reads from BIOS at 0x0000 while overlay is enabled, but reads from cart at 0x8000', (): void => {
    const cart = makeCart(8); // banks 0..7
    const bios = makeBios();
    const bus = new SmsBus(cart, null as any, null as any, null as any, null as any, { allowCartRam: true, bios });

    // At reset, BIOS overlay enabled
    expect(bus.read8(0x0000)).toBe(0xA1); // from BIOS

    // 0x8000 should be cart bank2 start (index 2) while BIOS still on
    expect(bus.read8(0x8000)).toBe(0x02);

    // Disable BIOS via port 0x3E bit2
    bus.writeIO8(0x3e, 0x04);
    expect(bus.read8(0x0000)).toBe(0x00); // cart bank0 sentinel
  });
});

