import { describe, it, expect } from 'vitest';
import { formatTrace } from '../../src/debug/trace.js';
describe('Trace formatter branches (flags without regs)', () => {
    it('does not include flags string when regs are absent even if showFlags=true', () => {
        const ev = {
            pcBefore: 0x0100,
            opcode: 0x00,
            cycles: 4,
            irqAccepted: false,
            nmiAccepted: false,
            text: 'NOP',
            bytes: [0x00],
        };
        const s = formatTrace(ev, { showBytes: false, showFlags: true, uppercaseHex: true });
        expect(s).toMatch(/0100: NOP/);
        expect(s.includes(' F=')).toBe(false);
    });
});
//# sourceMappingURL=trace_flags_absent.test.js.map