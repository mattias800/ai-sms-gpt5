import { describe, it, expect } from 'vitest';
import { formatTrace } from '../../src/debug/trace.js';
import type { TraceEvent } from '../../src/cpu/z80/z80.js';

describe('Trace formatter branches (flags without regs)', (): void => {
  it('does not include flags string when regs are absent even if showFlags=true', (): void => {
    const ev: TraceEvent = {
      pcBefore: 0x0100,
      opcode: 0x00,
      cycles: 4,
      irqAccepted: false,
      nmiAccepted: false,
      text: 'NOP',
      bytes: [0x00],
    } as TraceEvent;
    const s = formatTrace(ev, { showBytes: false, showFlags: true, uppercaseHex: true });
    expect(s).toMatch(/0100: NOP/);
    expect(s.includes(' F=')).toBe(false);
  });
});
