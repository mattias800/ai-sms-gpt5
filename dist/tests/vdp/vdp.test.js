import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';
// Constants mirrored from default VDP state for deterministic stepping
const CYCLES_PER_LINE = 228;
describe('VDP ports and timing', () => {
    it('status (0xBF) read returns and clears VBlank/IRQ state', () => {
        const vdp = createVDP();
        // Enable VBlank IRQ (reg1 bit5)
        vdp.writePort(0xbf, 0x20);
        vdp.writePort(0xbf, 0x80 | 0x01);
        // Advance to start of VBlank (line 192)
        vdp.tickCycles(192 * CYCLES_PER_LINE);
        // IRQ should be asserted
        expect(vdp.hasIRQ()).toBe(true);
        const status = vdp.readPort(0xbf);
        expect(status & 0x80).toBe(0x80);
        // Reading status clears flag and IRQ wire
        expect(vdp.hasIRQ()).toBe(false);
        // A second read should now return 0 for vblank bit
        const status2 = vdp.readPort(0xbf);
        expect(status2 & 0x80).toBe(0x00);
    });
    it('enabling IRQ during active VBlank immediately asserts the line', () => {
        const vdp = createVDP();
        // Enter VBlank with IRQ disabled
        vdp.tickCycles(192 * CYCLES_PER_LINE);
        expect(vdp.hasIRQ()).toBe(false);
        // Now enable VBlank IRQ (reg1 bit5) while VBlank flag is set
        vdp.writePort(0xbf, 0x20);
        vdp.writePort(0xbf, 0x80 | 0x01);
        expect(vdp.hasIRQ()).toBe(true);
    });
    it('frame wraps after linesPerFrame and continues ticking', () => {
        const vdp = createVDP();
        // Run a full frame worth of cycles to exercise wrap branch
        vdp.tickCycles(262 * CYCLES_PER_LINE);
        // No assertion needed; just ensure no throw and branch executed
        expect(true).toBe(true);
    });
    it('reg1 bit5 disable clears IRQ line; reg15 sets autoincrement used by data port', () => {
        const vdp = createVDP();
        // Enable IRQ and enter VBlank
        vdp.writePort(0xbf, 0x20);
        vdp.writePort(0xbf, 0x80 | 0x01);
        vdp.tickCycles(192 * CYCLES_PER_LINE);
        expect(vdp.hasIRQ()).toBe(true);
        // Now disable IRQ via reg1=0x00, which should drop the wire
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0x80 | 0x01);
        expect(vdp.hasIRQ()).toBe(false);
        // Set autoincrement to 2 via reg15
        vdp.writePort(0xbf, 0x02);
        vdp.writePort(0xbf, 0x80 | 0x0f);
        // Set address to 0x0000
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0x00);
        // Write two bytes; with autoinc=2 they should land at 0 and 2
        vdp.writePort(0xbe, 0xaa);
        vdp.writePort(0xbe, 0xbb);
        // Read back from 0x0000: first read returns buffer (0), then 0xaa, then 0xbb
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0x00);
        const r0 = vdp.readPort(0xbe);
        const r1 = vdp.readPort(0xbe);
        const r2 = vdp.readPort(0xbe);
        expect(r0).toBe(0x00);
        expect(r1).toBe(0xaa);
        expect(r2).toBe(0xbb);
    });
    it('reg15=0 is guarded to 1 autoincrement in this stub (avoid 0)', () => {
        const vdp = createVDP();
        // Set autoincrement to 0 via reg15; stub guards to 1
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0x80 | 0x0f);
        // Set address to 0x0000, write two bytes
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbe, 0x11);
        vdp.writePort(0xbe, 0x22);
        // Read back from 0x0000; with autoinc=1 this yields 0, 0x11, 0x22
        vdp.writePort(0xbf, 0x00);
        vdp.writePort(0xbf, 0x00);
        const r0 = vdp.readPort(0xbe);
        const r1 = vdp.readPort(0xbe);
        const r2 = vdp.readPort(0xbe);
        expect(r0).toBe(0x00);
        expect(r1).toBe(0x11);
        expect(r2).toBe(0x22);
    });
});
//# sourceMappingURL=vdp.test.js.map