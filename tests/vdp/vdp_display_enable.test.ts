import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

describe('VDP display enable via reg1 bit6', (): void => {
  it('setting reg1 bit6 turns displayEnabled on', (): void => {
    const vdp = createVDP();
    // reg1 <- 0x60 (bit6=1, bit5=1)
    vdp.writePort(0xbf, 0x60);
    vdp.writePort(0xbf, 0x80 | 0x01);
    const st = vdp.getState?.();
    expect(st?.displayEnabled).toBe(true);
  });
});
