export const u8 = (n: number): number => (n & 0xff) >>> 0;
export const u16 = (n: number): number => (n & 0xffff) >>> 0;
export const hi = (n: number): number => (n >>> 8) & 0xff;
export const lo = (n: number): number => n & 0xff;
export const getBit = (n: number, bit: number): number => ((n >>> bit) & 1) >>> 0;
export const setBit = (n: number, bit: number, v: 0 | 1): number => u8(v ? n | (1 << bit) : n & ~(1 << bit));
// Returns true for even parity (Z80 P/V for logical ops is even parity)
export const parity8 = (n: number): boolean => {
  const x = u8(n);
  const y = x ^ (x >>> 4);
  const z = y ^ (y >>> 2);
  const bit = (z ^ (z >>> 1)) & 1;
  return bit === 0;
};
