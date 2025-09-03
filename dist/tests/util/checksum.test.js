import { describe, it, expect } from 'vitest';
import { fnv1a32, hashString } from '../../src/util/checksum.js';
describe('checksum', () => {
    it('deterministic for same data', () => {
        const buf = new TextEncoder().encode('abcdef');
        const a = fnv1a32(buf);
        const b = fnv1a32(buf);
        expect(a).toBe(b);
    });
    it('different for different data', () => {
        const a = hashString('hello');
        const b = hashString('hello!');
        expect(a).not.toBe(b);
    });
});
//# sourceMappingURL=checksum.test.js.map