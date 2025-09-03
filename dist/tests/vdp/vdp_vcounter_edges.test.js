import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';
describe('VDP VCounter edges and wrap', () => {
    it('VCounter increments per line and wraps after linesPerFrame', () => {
        const vdp = createVDP();
        const gs0 = vdp.getState?.();
        const cpl = gs0.cyclesPerLine;
        const lpf = gs0.linesPerFrame;
        // Line starts at 0
        expect((vdp.readPort(0x7f) & 0xff)).toBe(0x00);
        // Advance one full line
        vdp.tickCycles(cpl);
        expect((vdp.readPort(0x7f) & 0xff)).toBe(0x01);
        // Advance to the last line before wrap
        vdp.tickCycles((lpf - 2) * cpl);
        const vBeforeWrap = vdp.readPort(0x7f) & 0xff; // should be lpf-1
        expect(vBeforeWrap).toBe(((lpf - 1) & 0xff));
        // Advance one more line to wrap to 0
        vdp.tickCycles(cpl);
        const vAfterWrap = vdp.readPort(0x7f) & 0xff;
        expect(vAfterWrap).toBe(0x00);
    });
});
//# sourceMappingURL=vdp_vcounter_edges.test.js.map