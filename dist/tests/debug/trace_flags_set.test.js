import { describe, it, expect } from 'vitest';
import { formatTrace } from '../../src/debug/trace.js';
describe('Trace formatter flags rendering', () => {
    it('renders all flags bits set (SZ5H3PNC)', () => {
        const regs = {
            a: 0, f: 0xff,
            b: 0, c: 0, d: 0, e: 0, h: 0, l: 0,
            ix: 0, iy: 0, sp: 0, pc: 0, i: 0, r: 0,
        };
        const ev = {
            pcBefore: 0x0000,
            opcode: 0x00,
            cycles: 4,
            irqAccepted: false,
            nmiAccepted: false,
            text: 'NOP',
            bytes: [0x00],
            regs,
        };
        const s = formatTrace(ev, { showBytes: false, showFlags: true, uppercaseHex: true });
        expect(s).toMatch(/F=SZ5H3PNC/);
    });
});
//# sourceMappingURL=trace_flags_set.test.js.map