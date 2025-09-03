const hex2 = (v, upper) => v.toString(16).padStart(2, '0')[upper ? 'toUpperCase' : 'toLowerCase']();
const hex4 = (v, upper) => v.toString(16).padStart(4, '0')[upper ? 'toUpperCase' : 'toLowerCase']();
const flagsToString = (f) => {
    const S = (f & 0x80) !== 0 ? 'S' : '.';
    const Z = (f & 0x40) !== 0 ? 'Z' : '.';
    const F5 = (f & 0x20) !== 0 ? '5' : '.';
    const H = (f & 0x10) !== 0 ? 'H' : '.';
    const F3 = (f & 0x08) !== 0 ? '3' : '.';
    const PV = (f & 0x04) !== 0 ? 'P' : '.'; // Parity/Overflow
    const N = (f & 0x02) !== 0 ? 'N' : '.';
    const C = (f & 0x01) !== 0 ? 'C' : '.';
    return `${S}${Z}${F5}${H}${F3}${PV}${N}${C}`;
};
const bytesToHex = (bytes, upper) => bytes.map((b) => hex2(b & 0xff, upper)).join(' ');
const regsToString = (r, upper) => {
    const AF = hex4(((r.a & 0xff) << 8) | (r.f & 0xff), upper);
    const BC = hex4(((r.b & 0xff) << 8) | (r.c & 0xff), upper);
    const DE = hex4(((r.d & 0xff) << 8) | (r.e & 0xff), upper);
    const HL = hex4(((r.h & 0xff) << 8) | (r.l & 0xff), upper);
    const IX = hex4(r.ix & 0xffff, upper);
    const IY = hex4(r.iy & 0xffff, upper);
    const SP = hex4(r.sp & 0xffff, upper);
    const PC = hex4(r.pc & 0xffff, upper);
    const I = hex2(r.i & 0xff, upper);
    const R = hex2(r.r & 0xff, upper);
    return `AF=${AF} BC=${BC} DE=${DE} HL=${HL} IX=${IX} IY=${IY} SP=${SP} PC=${PC} I=${I} R=${R}`;
};
export const formatTrace = (ev, opts) => {
    const upper = opts?.uppercaseHex ?? true;
    const pc = hex4(ev.pcBefore & 0xffff, upper);
    const head = `${pc}:`;
    const body = ev.text ?? '<INT>';
    const bytes = opts?.showBytes && ev.bytes && ev.bytes.length > 0 ? `  ${bytesToHex(ev.bytes, upper)}` : '';
    const cyc = `  cyc=${ev.cycles}`;
    const irq = ev.irqAccepted ? ' IRQ' : '';
    const nmi = ev.nmiAccepted ? ' NMI' : '';
    let flags = '';
    if (opts?.showFlags && ev.regs) {
        flags = `  F=${flagsToString(ev.regs.f & 0xff)}`;
    }
    const regs = ev.regs ? `  ${regsToString(ev.regs, upper)}` : '';
    return `${head} ${body}${bytes}${cyc}${irq}${nmi}${flags}${regs}`;
};
export const createTraceCollector = (opts) => {
    const lines = [];
    const onTrace = (ev) => {
        lines.push(formatTrace(ev, opts));
    };
    return { lines, onTrace };
};
//# sourceMappingURL=trace.js.map