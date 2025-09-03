import { describe, it, expect } from 'vitest';
import { createPSG } from '../../src/psg/sn76489.js';

const tone = (hi: number, lo: number): number => ((hi & 0x3f) << 4) | (lo & 0x0f);

describe('SN76489 PSG basics', (): void => {
  it('latch+data and data-only update tone0 low/high correctly', (): void => {
    const psg = createPSG();
    // Latch reg0 (tone0 low) with value 0x5
    psg.write(0x80 | 0x05);
    // Latch reg1 (tone0 high) then send data-only 6-bit value 0x2A
    psg.write(0x90 | 0x00);
    psg.write(0x2a);
    const s = psg.getState();
    expect(s.tones[0]).toBe(tone(0x2a, 0x5));
  });

  it('updates tone1 and tone2 low/high correctly as well', (): void => {
    const psg = createPSG();
    // Tone1 low/high => regs 2 and 3
    psg.write(0xa0 | 0x0c); // low nibble = 0xC
    psg.write(0xb0 | 0x00);
    psg.write(0x15); // 0b010101 => 0x15 high
    // Tone2 low/high => regs 4 and 5
    psg.write(0xc0 | 0x0e); // low nibble = 0xE
    psg.write(0xd0 | 0x00);
    psg.write(0x1f); // 0b011111 => 0x1F high
    const s = psg.getState();
    expect(s.tones[1]).toBe(tone(0x15, 0x0c));
    expect(s.tones[2]).toBe(tone(0x1f, 0x0e));
  });

  it('updates noise control and volume (noise channel) via latch writes', (): void => {
    const psg = createPSG();
    // Noise control: latch reg6 with data 0xB (mode=2, shift=3)
    psg.write(0xe0 | 0x0b);
    let s = psg.getState();
    expect(s.noise.mode).toBe(0x02);
    expect(s.noise.shift).toBe(0x03);

    // Volume: latch reg7 (volume) with value 0x0A -> maps to noise channel in our simplified model
    psg.write(0xf0 | 0x0a);
    s = psg.getState();
    expect(s.vols[3]).toBe(0x0a);
  });

  it('tickCycles is a no-op and getState returns clones', (): void => {
    const psg = createPSG();
    psg.write(0x80 | 0x01);
    psg.write(0x90 | 0x00);
    psg.write(0x3f);
    const s1 = psg.getState();
    psg.tickCycles(123);
    // Mutate returned copy; internal state must remain unchanged
    s1.tones[0] = 0x000;
    const s2 = psg.getState();
    expect(s2.tones[0]).not.toBe(0x000);
  });
});
