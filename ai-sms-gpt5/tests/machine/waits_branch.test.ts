import { describe, it, expect } from 'vitest';
import { createSmsWaitHooks } from '../../src/machine/waits.js';

describe('SMS wait state hooks branch coverage', (): void => {
  it('ioPenalty returns penalty for VDP mirrors and 0 for others/PSG', (): void => {
    const hooks = createSmsWaitHooks({ vdpPenalty: 5, includeWaitInCycles: true });
    // PSG 0x7F: no penalty
    expect(hooks.ioPenalty!(0x7f, false)).toBe(0);
    // VDP mirrors (low6==0x3e/0x3f): penalty
    expect(hooks.ioPenalty!(0xfe, false)).toBe(5);
    expect(hooks.ioPenalty!(0xff, false)).toBe(5);
    // Other ports: zero
    expect(hooks.ioPenalty!(0x01, false)).toBe(0);
  });
});

