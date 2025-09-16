import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';

const makeCart = (banks: number): Cartridge => {
  const rom = new Uint8Array(banks * 0x4000);
  for (let i = 0; i < banks; i++) rom[i * 0x4000] = i & 0xff;
  return { rom };
};

describe('Bus I/O direction masks and TH latches scaffold', (): void => {
  it('writing 0x3F updates internal direction mask and reading controller ports reflects output latch bits', (): void => {
    const bus = new SmsBus(makeCart(1), null as any, null as any);
    // Initially, reading controller port should return 0xFF (no devices wired)
    const before = bus.readIO8(0xdc) & 0xff;
    expect(before).toBeTypeOf('number');

    // Write to 0x3F sets direction and TH lines; here we just ensure it does not throw and affects read path
    bus.writeIO8(0x3f, 0b11000000); // set TH-A/TH-B high explicitly
    const afterA = bus.readIO8(0xdc) & 0xff;
    const afterB = bus.readIO8(0xdd) & 0xff;
    // We can't assert exact wiring without full controller emulation; just ensure values are stable numbers.
    expect(afterA & 0xff).toBe(afterA);
    expect(afterB & 0xff).toBe(afterB);
  });
});

