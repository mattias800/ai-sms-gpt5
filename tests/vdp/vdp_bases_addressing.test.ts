import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';

const setReg = (vdp: any, idx: number, val: number): void => {
  vdp.writePort(0xbf, val & 0xff);
  vdp.writePort(0xbf, 0x80 | (idx & 0x0f));
};

describe('VDP base address decoding (Mode 4)', (): void => {
  it('name table base uses R2[3:1] << 11', (): void => {
    const vdp = createVDP();
    const cases: Array<{ r2: number; expected: number }> = [
      { r2: 0x00, expected: 0x0000 },
      { r2: 0x02, expected: 0x0800 },
      { r2: 0x04, expected: 0x1000 },
      { r2: 0x06, expected: 0x1800 },
      { r2: 0x08, expected: 0x2000 },
      { r2: 0x0e, expected: 0x3800 },
    ];
    for (const c of cases) {
      setReg(vdp, 2, c.r2);
      const st = vdp.getState?.();
      expect(st?.nameTableBase).toBe(c.expected);
    }
  });

  it('sprite pattern base selects 0x0000 or 0x2000 by R6 bit2', (): void => {
    const vdp = createVDP();
    setReg(vdp, 6, 0x00);
    expect(vdp.getState?.()?.spritePatternBase).toBe(0x0000);
    setReg(vdp, 6, 0x04);
    expect(vdp.getState?.()?.spritePatternBase).toBe(0x2000);
  });

  it('sprite attribute base uses R5[6:1] << 7', (): void => {
    const vdp = createVDP();
    // Explicitly set R5 to 0x7E -> (0x7e <<7) = 0x3f00
    setReg(vdp, 5, 0x7e);
    expect(vdp.getState?.()?.spriteAttrBase).toBe(0x3f00);
    setReg(vdp, 5, 0x00);
    expect(vdp.getState?.()?.spriteAttrBase).toBe(0x0000);
    setReg(vdp, 5, 0x02); // 0000 0010 -> (0x02 & 0x7e)<<7 = 0x100
    expect(vdp.getState?.()?.spriteAttrBase).toBe(0x0100);
  });
});
