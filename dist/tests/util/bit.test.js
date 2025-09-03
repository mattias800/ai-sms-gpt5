import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { u8, u16, hi, lo, getBit, setBit, parity8 } from '../../src/util/bit.js';
const popcount8 = (n) => {
    let x = n & 0xff;
    x = x - ((x >>> 1) & 0x55);
    x = (x & 0x33) + ((x >>> 2) & 0x33);
    return (((x + (x >>> 4)) & 0x0f) * 0x01) & 0xff;
};
describe('bit utils', () => {
    it('u8 clamps to 0..255', () => {
        expect(u8(0x123)).toBe(0x23);
        expect(u8(-1)).toBe(0xff);
    });
    it('u16 clamps to 0..65535', () => {
        expect(u16(0x12345)).toBe(0x2345);
        expect(u16(-1)).toBe(0xffff);
    });
    it('hi/lo extract bytes', () => {
        expect(hi(0x1234)).toBe(0x12);
        expect(lo(0x1234)).toBe(0x34);
    });
    it('getBit/setBit roundtrip', () => {
        for (let b = 0; b < 8; b++) {
            expect(getBit(0, b)).toBe(0);
            expect(getBit(setBit(0, b, 1), b)).toBe(1);
            expect(getBit(setBit(0xff, b, 0), b)).toBe(0);
        }
    });
    it('property: u8 and u16 idempotent and consistent', () => {
        fc.assert(fc.property(fc.integer({ min: -1e9, max: 1e9 }), (n) => {
            const a = u8(n);
            const b = u8(a);
            expect(a).toBe(b);
            const c = u16(n);
            const d = u16(c);
            expect(c).toBe(d);
        }));
    });
    it('parity8 equals even parity of popcount', () => {
        fc.assert(fc.property(fc.integer({ min: 0, max: 0xff }), (n) => {
            const even = (popcount8(n) & 1) === 0;
            expect(parity8(n)).toBe(even);
        }));
    });
});
//# sourceMappingURL=bit.test.js.map