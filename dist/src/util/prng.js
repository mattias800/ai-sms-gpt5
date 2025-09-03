export const createPrng = (seed) => {
    // Xorshift32 deterministic PRNG
    let state = seed >>> 0 || 0xdeadbeef;
    const nextU32 = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state >>> 0;
    };
    const nextByte = () => (nextU32() & 0xff) >>> 0;
    return { seed: seed >>> 0, nextU32, nextByte };
};
//# sourceMappingURL=prng.js.map