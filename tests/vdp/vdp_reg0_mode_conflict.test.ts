import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

// Verify R0 M3/M4 conflict resolution: when both bits are set, M4 should win (M3 cleared)
describe('VDP register 0 mode conflict (M3 vs M4)', (): void => {
  it('clears M3 bit when M4 is set in R0', (): void => {
    const vdp = createVDP();
    // Write to control port to set register 0 to value 0x06 (M3=bit1, M4=bit2)
    vdp.writePort(0xbf, 0x06); // low (value)
    vdp.writePort(0xbf, 0x80 | 0x00); // high: code=2 (register write), reg=0

    const st = vdp.getState!();
    // Expect M3 (bit1) cleared, M4 (bit2) preserved -> value becomes 0x04
    expect((st.regs[0] & 0xff)).toBe(0x04);
  });
});

