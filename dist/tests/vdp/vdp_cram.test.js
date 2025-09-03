import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';
describe('VDP CRAM writes', () => {
    it('code=3 selects CRAM, writes clamp to 6-bit and autoincrement advances index', () => {
        const vdp = createVDP();
        // Set code=3 (CRAM) and address=0x0000 via control port writes
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0xc0 | 0x00);
        // Write two palette entries; second write uses a value beyond 6-bit to test clamping
        vdp.writePort(0xbe, 0x2a);
        vdp.writePort(0xbe, 0xff);
        const st = vdp.getState?.();
        expect(st?.cramWrites).toBe(2);
        expect(st?.lastCramIndex).toBe(1);
        expect(st?.lastCramValue).toBe(0x3f);
        expect(st?.cram[0]).toBe(0x2a);
        expect(st?.cram[1]).toBe(0x3f);
    });
});
//# sourceMappingURL=vdp_cram.test.js.map