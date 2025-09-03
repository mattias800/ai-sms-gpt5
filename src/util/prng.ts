export interface PRNG {
  readonly seed: number;
  nextU32: () => number;
  nextByte: () => number;
}

export const createPrng = (seed: number): PRNG => {
  // Xorshift32 deterministic PRNG
  let state = seed >>> 0 || 0xdeadbeef;
  const nextU32 = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const nextByte = (): number => (nextU32() & 0xff) >>> 0;
  return { seed: seed >>> 0, nextU32, nextByte };
};
