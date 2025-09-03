import { describe, it, expect } from 'vitest';
import { SmsBus } from '../../src/bus/bus.js';
const cartFromBanks = (banks) => {
    const rom = new Uint8Array(banks * 0x4000);
    for (let i = 0; i < banks; i++)
        rom[i * 0x4000] = i; // sentinel at first byte of each bank
    return { rom };
};
describe('Bus edge behaviors', () => {
    it('write to 0xFFFF (SRAM control) is ignored without side-effects', () => {
        const bus = new SmsBus(cartFromBanks(4), null);
        // Verify initial bank sentinels
        expect(bus.read8(0x0000)).toBe(0);
        expect(bus.read8(0x4000)).toBe(1);
        expect(bus.read8(0x8000)).toBe(2);
        // Write to 0xFFFF control register
        bus.write8(0xffff, 0x99);
        // Sentinels unchanged
        expect(bus.read8(0x0000)).toBe(0);
        expect(bus.read8(0x4000)).toBe(1);
        expect(bus.read8(0x8000)).toBe(2);
    });
    it('readIO8 default returns 0xFF when no VDP and not PSG port', () => {
        const bus = new SmsBus(cartFromBanks(1), null);
        expect(bus.readIO8(0x10)).toBe(0xff);
    });
});
//# sourceMappingURL=bus_edges.test.js.map