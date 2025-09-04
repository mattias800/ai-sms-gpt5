import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const cartFromBanks = (banks: number): Cartridge => {
  const rom = new Uint8Array(banks * 0x4000);
  for (let i = 0; i < banks; i++) rom[i * 0x4000] = i; // sentinel at first byte of each bank
  return { rom };
};

describe('Bus edge behaviors', (): void => {
  it('write to 0xFFFF controls bank in slot 2 (0x8000-0xBFFF)', (): void => {
    const bus = new SmsBus(cartFromBanks(4), null);
    // Verify initial bank sentinels
    expect(bus.read8(0x0000)).toBe(0);
    expect(bus.read8(0x4000)).toBe(1);
    expect(bus.read8(0x8000)).toBe(2);
    // Write to 0xFFFF control register - selects bank (0x99 % 4 = 1) in slot 2
    bus.write8(0xffff, 0x99);
    // Slot 2 now shows bank 1
    expect(bus.read8(0x0000)).toBe(0);
    expect(bus.read8(0x4000)).toBe(1);
    expect(bus.read8(0x8000)).toBe(1); // Changed from 2 to 1
  });

  it('readIO8 default returns 0xFF when no VDP and not PSG port', (): void => {
    const bus = new SmsBus(cartFromBanks(1), null);
    expect(bus.readIO8(0x10)).toBe(0xff);
  });
});
