import { describe, it, expect } from 'vitest';
import { createPSG } from '../../src/psg/sn76489.js';

const TICK = 16; // CPU cycles per PSG tick (divider)

const programTone = (psg: ReturnType<typeof createPSG>, ch: number, n: number, vol: number): void => {
  const chBits = (ch & 0x03) << 5;
  const lowNib = n & 0x0f;
  const high6 = (n >> 4) & 0x3f;
  // Latch tone low nibble
  psg.write(0x80 | chBits | lowNib);
  // Data-only high bits
  psg.write(high6);
  // Volume latch (0 = loudest)
  const volCmd = 0x90 | chBits | (vol & 0x0f);
  psg.write(volCmd);
};

describe('SN76489 tone period mapping', () => {
  const measurePeriod = (n: number): number => {
    const psg = createPSG();
    programTone(psg, 0, n, 0x00);
    // Advance until first toggle
    let prev = psg.getState().outputs[0];
    let ticks = 0;
    let toggles = 0;
    // Skip a small warm-up
    for (let i=0;i<64;i++) psg.tickCycles(TICK);
    // Measure several intervals
    const intervals: number[] = [];
    while (intervals.length < 8 && ticks < 200000) {
      psg.tickCycles(TICK);
      ticks++;
      const out = psg.getState().outputs[0];
      if (out !== prev) {
        prev = out;
        toggles++;
        intervals.push(0);
      }
      if (intervals.length>0) intervals[intervals.length-1]!++;
    }
    // Compute median interval in PSG ticks between toggles
    if (intervals.length < 3) return Infinity;
    intervals.shift(); // drop first
    const sorted = intervals.slice(0, intervals.length-1).sort((a,b)=>a-b);
    const mid = sorted[sorted.length>>1] ?? Infinity;
    return mid;
  };

  const approx = (a: number, b: number, tol: number): void => {
    expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
  };

  it('N=1 yields ~1 tick between toggles', () => {
    const measured = measurePeriod(1);
    approx(measured, 1, 1);
  });

  it('N=2 yields ~2 ticks between toggles', () => {
    const measured = measurePeriod(2);
    approx(measured, 2, 1);
  });

  it('N=3 yields ~3 ticks between toggles', () => {
    const measured = measurePeriod(3);
    approx(measured, 3, 1);
  });

  it('N=64 yields ~64 ticks between toggles', () => {
    const measured = measurePeriod(64);
    approx(measured, 64, 2);
  });
});