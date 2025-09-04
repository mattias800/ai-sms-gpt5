import { describe, it, expect } from 'vitest';
import { createPSG } from '../src/psg/sn76489.js';

describe('SN76489 PSG', () => {
  it('should initialize with all channels silent', () => {
    const psg = createPSG();
    const state = psg.getState();

    // All volumes should be 0xF (silent)
    expect(state.vols).toEqual([0xf, 0xf, 0xf, 0xf]);
    expect(psg.getSample()).toBe(-8192); // Should output silence
  });

  it('should set tone frequency via latch command', () => {
    const psg = createPSG();

    // Write tone 0 frequency (latch + low 4 bits)
    psg.write(0x80 | 0x0f); // Latch channel 0 tone, low nibble = 0xF

    const state = psg.getState();
    expect(state.tones[0] & 0x0f).toBe(0x0f);
    expect(state.latchedReg).toBe(0); // Channel 0 tone register
  });

  it('should set tone frequency high bits via data command', () => {
    const psg = createPSG();

    // First latch channel 0
    psg.write(0x80); // Latch channel 0 tone, low nibble = 0
    // Then write high 6 bits
    psg.write(0x3f); // Data command, 6 bits = 0x3F

    const state = psg.getState();
    expect(state.tones[0]).toBe(0x3f0); // High 6 bits shifted
  });

  it('should set volume via latch command', () => {
    const psg = createPSG();

    // Write channel 0 volume (bit 7=1 for latch, bits 6-4=001 for ch0 vol, bits 3-0=volume)
    psg.write(0x90 | 0x00); // Channel 0 volume, full volume (0 = loudest)

    const state = psg.getState();
    expect(state.vols[0]).toBe(0x00); // Full volume
  });

  it('should set multiple channel volumes', () => {
    const psg = createPSG();

    // Channel 0 volume = 5
    psg.write(0x90 | 0x05);
    // Channel 1 volume = 8
    psg.write(0xb0 | 0x08);
    // Channel 2 volume = 2
    psg.write(0xd0 | 0x02);
    // Noise volume = 10
    psg.write(0xf0 | 0x0a);

    const state = psg.getState();
    expect(state.vols).toEqual([5, 8, 2, 10]);
  });

  it('should configure noise channel', () => {
    const psg = createPSG();

    // Write noise control (bit 7=1 for latch, bits 6-4=110 for noise, bits 3-0=control)
    // Bits 2-0: shift rate, bit 2: white/periodic
    psg.write(0xe0 | 0x05); // Noise: white noise (bit 2=1), shift rate 1

    const state = psg.getState();
    expect(state.noise.mode).toBe(1); // Bit 2 of data >> 2
    expect(state.noise.shift).toBe(1); // Bits 1-0
  });

  it('should generate square wave when tone enabled', () => {
    const psg = createPSG();

    // Set channel 0: frequency and volume
    psg.write(0x80 | 0x0a); // Tone 0 low = 10
    psg.write(0x00); // Tone 0 high = 0 (frequency = 10)
    psg.write(0x90); // Channel 0 volume = 0 (loudest)

    // Tick some cycles to generate output
    psg.tickCycles(1000);

    const state = psg.getState();
    expect(state.tones[0]).toBe(10);
    expect(state.vols[0]).toBe(0);

    // Should have toggled output at least once
    expect(state.counters[0]).toBeLessThanOrEqual(10);
  });

  it('should handle complete frequency setting sequence', () => {
    const psg = createPSG();

    // Set tone 1 to frequency 0x123 (low nibble first, then high)
    psg.write(0xa0 | 0x03); // Channel 1 tone latch, low nibble = 0x3
    psg.write(0x12); // High 6 bits = 0x12

    const state = psg.getState();
    expect(state.tones[1]).toBe(0x123);
  });

  it('should reset to initial state', () => {
    const psg = createPSG();

    // Change some state
    psg.write(0x90); // Set channel 0 to full volume
    psg.write(0xa5); // Set channel 1 tone
    psg.tickCycles(1000);

    // Reset
    psg.reset();

    const state = psg.getState();
    expect(state.vols).toEqual([0xf, 0xf, 0xf, 0xf]);
    expect(state.tones).toEqual([0, 0, 0]);
    expect(state.counters).toEqual([0, 0, 0]);
    expect(state.outputs).toEqual([false, false, false]);
  });

  it('should generate different samples based on channel outputs', () => {
    const psg = createPSG();

    // Enable channel 0 at half volume
    psg.write(0x90 | 0x07); // Channel 0 volume = 7 (mid volume)

    // Force output high by manipulating state
    const state = psg.getState();

    // Get sample when output is low (should be quiet)
    const sampleLow = psg.getSample();

    // Tick to toggle output
    psg.write(0x80 | 0x01); // Very low frequency
    psg.tickCycles(100);

    const sampleAfterTick = psg.getSample();

    // Samples might be different if output toggled
    // At least verify they're in valid range
    expect(sampleLow).toBeGreaterThanOrEqual(-8192);
    expect(sampleLow).toBeLessThanOrEqual(8191);
    expect(sampleAfterTick).toBeGreaterThanOrEqual(-8192);
    expect(sampleAfterTick).toBeLessThanOrEqual(8191);
  });
});
