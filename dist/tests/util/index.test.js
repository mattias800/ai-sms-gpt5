import { describe, it, expect } from 'vitest';
import { u8, hashString, createPrng } from '../../src/index.js';
describe('index exports', () => {
    it('re-exports util functions', () => {
        expect(u8(0x1ff)).toBe(0xff);
        expect(hashString('x')).toBeTypeOf('number');
        const p = createPrng(1);
        expect(typeof p.nextU32()).toBe('number');
    });
});
//# sourceMappingURL=index.test.js.map