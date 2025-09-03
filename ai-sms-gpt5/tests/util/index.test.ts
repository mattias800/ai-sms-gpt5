import { describe, it, expect } from 'vitest';
import { u8, hashString, createPrng } from '../../src/index.js';

describe('index exports', (): void => {
  it('re-exports util functions', (): void => {
    expect(u8(0x1ff)).toBe(0xff);
    expect(hashString('x')).toBeTypeOf('number');
    const p = createPrng(1);
    expect(typeof p.nextU32()).toBe('number');
  });
});
