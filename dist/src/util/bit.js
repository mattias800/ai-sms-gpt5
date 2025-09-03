export const u8 = (n) => (n & 0xff) >>> 0;
export const u16 = (n) => (n & 0xffff) >>> 0;
export const hi = (n) => (n >>> 8) & 0xff;
export const lo = (n) => n & 0xff;
export const getBit = (n, bit) => ((n >>> bit) & 1) >>> 0;
export const setBit = (n, bit, v) => u8(v ? n | (1 << bit) : n & ~(1 << bit));
// Returns true for even parity (Z80 P/V for logical ops is even parity)
export const parity8 = (n) => {
    const x = u8(n);
    const y = x ^ (x >>> 4);
    const z = y ^ (y >>> 2);
    const bit = (z ^ (z >>> 1)) & 1;
    return bit === 0;
};
//# sourceMappingURL=bit.js.map