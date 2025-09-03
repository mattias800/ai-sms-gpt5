import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';
describe('VDP IRQ enable during active VBlank', () => {
    it('asserts IRQ immediately when R1 bit5 is set while already in VBlank', () => {
        const vdp = createVDP();
        const gs0 = vdp.getState?.();
        const cpl = gs0.cyclesPerLine;
        // Advance to VBlank start line (default 192)
        vdp.tickCycles(192 * cpl);
        // Initially, IRQ should not be asserted because R1 bit5 is not set.
        expect(vdp.hasIRQ()).toBe(false);
        // Enable VBlank IRQ in R1 during active VBlank.
        vdp.writePort(0xbf, 0x20);
        vdp.writePort(0xbf, 0x80 | 0x01);
        // When enabling during VBlank, the IRQ line should assert immediately.
        expect(vdp.hasIRQ()).toBe(true);
    });
});
//# sourceMappingURL=vdp_irq_enable_during_vblank.test.js.map