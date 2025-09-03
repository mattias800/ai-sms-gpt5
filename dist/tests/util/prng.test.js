import { describe, it, expect } from 'vitest';
import { createPrng } from '../../src/util/prng.js';
describe('prng', () => {
    it('same seed yields same sequence', () => {
        const a = createPrng(123);
        const b = createPrng(123);
        const seqA = [a.nextU32(), a.nextU32(), a.nextU32(), a.nextU32()];
        const seqB = [b.nextU32(), b.nextU32(), b.nextU32(), b.nextU32()];
        expect(seqA).toEqual(seqB);
    });
    it('nextByte is within 0..255', () => {
        const p = createPrng(456);
        const arr = new Array(100).fill(0).map(() => p.nextByte());
        for (const v of arr)
            expect(v).toBeGreaterThanOrEqual(0);
        for (const v of arr)
            expect(v).toBeLessThanOrEqual(255);
    });
    it('seed 0 falls back to non-zero internal state', () => {
        const p = createPrng(0);
        // ensure sequence is generated and not stuck at zero
        const values = [p.nextU32(), p.nextU32(), p.nextU32()];
        // should have at least one non-zero value
        expect(values.some((v) => v !== 0)).toBe(true);
    });
});
//# sourceMappingURL=prng.test.js.map