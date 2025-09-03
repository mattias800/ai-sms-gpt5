import { describe, it, expect } from 'vitest';
import { createSmsWaitHooks } from '../../src/machine/waits.js';

describe('SMS wait state hooks defaults', (): void => {
  it('defaults includeWaitInCycles=false and vdpPenalty=4 when cfg is undefined', (): void => {
    const hooks = createSmsWaitHooks();
    expect(hooks.includeWaitInCycles).toBe(false);
    // Default penalty applies to VDP mirrored ports (low6==0x3e/0x3f)
    expect(hooks.ioPenalty!(0xfe, false)).toBe(4); // maps to 0xBE
    expect(hooks.ioPenalty!(0xff, false)).toBe(4); // maps to 0xBF
    // PSG 0x7F remains unpenalized
    expect(hooks.ioPenalty!(0x7f, false)).toBe(0);
  });
});

