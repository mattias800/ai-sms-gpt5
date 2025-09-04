import { describe, it, expect } from 'vitest';
import { formatTrace } from '../../src/debug/trace.js';
import type { TraceEvent, RegsSnapshot } from '../../src/cpu/z80/z80.js';

describe('Debug trace formatter branch variants', (): void => {
  it('handles no bytes/regs with lowercase hex and IRQ interrupt', (): void => {
    const ev: TraceEvent = {
      pcBefore: 0x1234,
      opcode: null,
      cycles: 13,
      irqAccepted: true,
      nmiAccepted: false,
    } as TraceEvent;
    const s = formatTrace(ev, { showBytes: true, showFlags: true, uppercaseHex: false });
    expect(s).toMatch(/1234: <INT> {2}cyc=13 IRQ/);
    // Lowercase hex
    expect(s).toMatch(/^1234:/);
  });

  it('handles provided bytes and regs with lowercase hex', (): void => {
    const regs: RegsSnapshot = {
      a: 0x12,
      f: 0x00,
      b: 0x34,
      c: 0x56,
      d: 0x78,
      e: 0x9a,
      h: 0xbc,
      l: 0xde,
      ix: 0x2000,
      iy: 0x3000,
      sp: 0xff00,
      pc: 0x4000,
      i: 0xaa,
      r: 0x55,
    };
    const ev: TraceEvent = {
      pcBefore: 0x1000,
      opcode: 0x06,
      cycles: 7,
      irqAccepted: false,
      nmiAccepted: false,
      text: 'LD B,12',
      bytes: [0x06, 0x12],
      regs,
    };
    const s = formatTrace(ev, { showBytes: true, showFlags: true, uppercaseHex: false });
    expect(s).toMatch(/1000: LD B,12 {2}06 12 {2}cyc=7/);
    expect(s).toMatch(/AF=1200 BC=3456 DE=789a HL=bcde IX=2000 IY=3000 SP=ff00 PC=4000 I=aa R=55/);
  });

  it('formats NMI acceptance with NMI tag', (): void => {
    const ev: TraceEvent = {
      pcBefore: 0xabcd,
      opcode: null,
      cycles: 11,
      irqAccepted: false,
      nmiAccepted: true,
    } as TraceEvent;
    const s = formatTrace(ev, { showBytes: false, showFlags: false });
    expect(s).toMatch(/ABCD: <INT> {2}cyc=11 NMI/);
  });
});
