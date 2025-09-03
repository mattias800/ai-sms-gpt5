import { u8 } from '../../util/bit.js';
import { parity8 } from '../../util/bit.js';
import { FLAG_3, FLAG_5, FLAG_C, FLAG_H, FLAG_N, FLAG_PV, FLAG_S, FLAG_Z } from './flags.js';
import { createResetState } from './state.js';
import { disassembleOne } from './disasm.js';
export const createZ80 = (opts) => {
    let s = createResetState();
    const bus = opts.bus;
    // Wait-state scaffolding (disabled by default)
    let ws = opts.waitStates ?? null;
    let lastWaitCycles = 0; // last instruction's accumulated wait cycles
    let curWaitCycles = 0; // accumulator for the current instruction
    const wsEnabled = () => !!(ws && ws.enabled);
    const addMemPenalty = (addr, isWrite) => {
        if (!wsEnabled())
            return;
        let p = 0;
        if (ws?.memPenalty)
            p = ws.memPenalty(addr & 0xffff, isWrite) ?? 0;
        else if (!isWrite && ws?.onMemoryRead)
            p = ws.onMemoryRead(addr & 0xffff) ?? 0;
        else if (isWrite && ws?.onMemoryWrite)
            p = ws.onMemoryWrite(addr & 0xffff) ?? 0;
        if (p && p > 0)
            curWaitCycles += p | 0;
    };
    const addIoPenalty = (port, isWrite) => {
        if (!wsEnabled())
            return;
        let p = 0;
        if (ws?.ioPenalty)
            p = ws.ioPenalty(port & 0xff, isWrite) ?? 0;
        else if (!isWrite && ws?.onIORead)
            p = ws.onIORead(port & 0xff) ?? 0;
        else if (isWrite && ws?.onIOWrite)
            p = ws.onIOWrite(port & 0xff) ?? 0;
        if (p && p > 0)
            curWaitCycles += p | 0;
    };
    let pendingIRQ = false;
    let pendingNMI = false;
    let iff1Pending = false; // EI enables after next instruction
    let eiMaskOne = false; // Mask IRQ acceptance for exactly one subsequent instruction after EI
    let im2Vector = 0xff; // Vector byte placed on data bus by device in IM2; default to 0xFF
    let im0Vector = 0x0038; // Default IM0 behaves like RST 38h
    let im0Opcode = null; // Optional injected opcode for IM0 (typically a RST xx)
    const read8 = (addr) => {
        const v = bus.read8(addr);
        addMemPenalty(addr, false);
        return v;
    };
    const write8 = (addr, val) => {
        bus.write8(addr, val);
        addMemPenalty(addr, true);
    };
    const readIO8 = (port) => {
        const v = bus.readIO8(port);
        addIoPenalty(port, false);
        return v;
    };
    const writeIO8 = (port, val) => {
        bus.writeIO8(port, val);
        addIoPenalty(port, true);
    };
    const getHL = () => ((s.h << 8) | s.l) & 0xffff;
    const setSZ53 = (x) => {
        const v = u8(x);
        let f = 0;
        if (v & 0x80)
            f |= FLAG_S;
        if (v === 0)
            f |= FLAG_Z;
        if (v & 0x20)
            f |= FLAG_5;
        if (v & 0x08)
            f |= FLAG_3;
        return f;
    };
    const add8 = (a, b, carry) => {
        const res = (a + b + carry) & 0xff;
        const hc = (a & 0x0f) + (b & 0x0f) + carry > 0x0f;
        const c = a + b + carry > 0xff;
        const overflow = (~(a ^ b) & (a ^ res) & 0x80) !== 0;
        let f = setSZ53(res);
        if (hc)
            f |= FLAG_H;
        if (overflow)
            f |= FLAG_PV;
        if (c)
            f |= FLAG_C;
        // N cleared
        return { r: res, f };
    };
    const sub8 = (a, b, carry) => {
        const res = (a - b - carry) & 0xff;
        const hc = (a & 0x0f) - (b & 0x0f) - carry < 0;
        const c = a < b + carry;
        const overflow = ((a ^ b) & (a ^ res) & 0x80) !== 0;
        let f = setSZ53(res) | FLAG_N;
        if (hc)
            f |= FLAG_H;
        if (overflow)
            f |= FLAG_PV;
        if (c)
            f |= FLAG_C;
        return { r: res, f };
    };
    const inc8 = (x, fPrev) => {
        const r = (x + 1) & 0xff;
        const hc = (x & 0x0f) + 1 > 0x0f;
        let f = setSZ53(r);
        if (hc)
            f |= FLAG_H;
        // P/V set if overflow 0x7F->0x80
        if (x === 0x7f)
            f |= FLAG_PV;
        // N reset; preserve C
        if (fPrev & FLAG_C)
            f |= FLAG_C;
        return { r, f };
    };
    const dec8 = (x, fPrev) => {
        const r = (x - 1) & 0xff;
        const hb = (x & 0x0f) - 1 < 0;
        let f = setSZ53(r) | FLAG_N;
        if (hb)
            f |= FLAG_H;
        // P/V set if overflow 0x80->0x7F
        if (x === 0x80)
            f |= FLAG_PV;
        // preserve C
        if (fPrev & FLAG_C)
            f |= FLAG_C;
        return { r, f };
    };
    const logicFlags = (r, h) => {
        let f = setSZ53(r);
        if (h)
            f |= FLAG_H;
        if (parity8(r))
            f |= FLAG_PV;
        // N=0, C=0
        return f;
    };
    const regGet = (code) => {
        switch (code & 7) {
            case 0:
                return s.b;
            case 1:
                return s.c;
            case 2:
                return s.d;
            case 3:
                return s.e;
            case 4:
                return s.h;
            case 5:
                return s.l;
            case 6:
                return read8(getHL());
            case 7:
                return s.a;
            default:
                /* c8 ignore next */
                return 0; // unreachable
        }
    };
    const regSet = (code, val) => {
        const v = val & 0xff;
        switch (code & 7) {
            case 0:
                s.b = v;
                break;
            case 1:
                s.c = v;
                break;
            case 2:
                s.d = v;
                break;
            case 3:
                s.e = v;
                break;
            case 4:
                s.h = v;
                break;
            case 5:
                s.l = v;
                break;
            case 6:
                write8(getHL(), v);
                break;
            case 7:
                s.a = v;
                break;
        }
    };
    const fetch8 = () => {
        const v = read8(s.pc);
        s.pc = (s.pc + 1) & 0xffff;
        return v;
    };
    // Fetch an opcode or prefix (M1 cycle) and update the refresh register R
    const fetchOpcode = () => {
        const v = read8(s.pc);
        s.pc = (s.pc + 1) & 0xffff;
        // Increment low 7 bits; preserve bit 7
        s.r = ((s.r & 0x80) | (((s.r & 0x7f) + 1) & 0x7f)) & 0xff;
        return v;
    };
    const push16 = (v) => {
        s.sp = (s.sp - 1) & 0xffff;
        write8(s.sp, (v >>> 8) & 0xff);
        s.sp = (s.sp - 1) & 0xffff;
        write8(s.sp, v & 0xff);
    };
    const pop16 = () => {
        const lo = read8(s.sp);
        s.sp = (s.sp + 1) & 0xffff;
        const hi = read8(s.sp);
        s.sp = (s.sp + 1) & 0xffff;
        return ((hi << 8) | lo) & 0xffff;
    };
    const read16 = (addr) => {
        const lo = read8(addr);
        const hi = read8((addr + 1) & 0xffff);
        return ((hi << 8) | lo) & 0xffff;
    };
    const write16 = (addr, val) => {
        write8(addr, val & 0xff);
        write8((addr + 1) & 0xffff, (val >>> 8) & 0xff);
    };
    const s8 = (n) => ((n & 0x80) !== 0 ? n - 0x100 : n);
    const cond = (cc) => {
        // cc mapping: 0:NZ,1:Z,2:NC,3:C,4:PO,5:PE,6:P,7:M
        switch (cc & 7) {
            case 0:
                return (s.f & FLAG_Z) === 0;
            case 1:
                return (s.f & FLAG_Z) !== 0;
            case 2:
                return (s.f & FLAG_C) === 0;
            case 3:
                return (s.f & FLAG_C) !== 0;
            case 4: {
                // Parity odd
                return (s.f & FLAG_PV) === 0;
            }
            case 5: {
                // Parity even
                return (s.f & FLAG_PV) !== 0;
            }
            case 6:
                return (s.f & FLAG_S) === 0;
            case 7:
                return (s.f & FLAG_S) !== 0;
            default:
                /* c8 ignore next */
                return false;
        }
    };
    const stepOne = () => {
        // Make last instruction's wait-cycle count visible and reset accumulator for this instruction
        lastWaitCycles = curWaitCycles;
        curWaitCycles = 0;
        // Trace helpers
        const tracer = typeof opts.onTrace === 'function' ? opts.onTrace : null;
        const traceWithDisasm = !!opts.traceDisasm;
        const pc0 = s.pc & 0xffff;
        let currOp = null;
        // Helper to return cycles with optional wait-state inclusion
        const mkRes = (baseCycles, irqA, nmiA) => {
            const extra = wsEnabled() && ws?.includeWaitInCycles ? (curWaitCycles | 0) : 0;
            const res = { cycles: baseCycles + extra, irqAccepted: irqA, nmiAccepted: nmiA };
            if (tracer) {
                let text;
                let bytes;
                if (traceWithDisasm && currOp !== null) {
                    // Use direct bus read to avoid affecting wait-state accounting
                    const r = disassembleOne((addr) => bus.read8(addr & 0xffff) & 0xff, pc0);
                    text = r.text;
                    bytes = [...r.bytes];
                }
                const regs = opts.traceRegs
                    ? {
                        a: s.a & 0xff, f: s.f & 0xff,
                        b: s.b & 0xff, c: s.c & 0xff,
                        d: s.d & 0xff, e: s.e & 0xff,
                        h: s.h & 0xff, l: s.l & 0xff,
                        ix: s.ix & 0xffff, iy: s.iy & 0xffff,
                        sp: s.sp & 0xffff, pc: s.pc & 0xffff,
                        i: s.i & 0xff, r: s.r & 0xff,
                    }
                    : undefined;
                tracer({ pcBefore: pc0, opcode: currOp, cycles: res.cycles, irqAccepted: irqA, nmiAccepted: nmiA, text, bytes, regs });
            }
            return res;
        };
        // Commit EI pending enable before decoding the next instruction, but mask IRQ for exactly one instruction
        if (iff1Pending) {
            s.iff1 = true;
            s.iff2 = true;
            iff1Pending = false;
            eiMaskOne = true;
        }
        const blockIRQThisStep = eiMaskOne;
        // Clear the mask so it only blocks this single step
        eiMaskOne = false;
        // If CPU is halted, interrupts (NMI first) can be accepted immediately on this step
        if (s.halted) {
            if (pendingNMI) {
                pendingNMI = false;
                s.iff1 = false; // mask maskable IRQs
                s.halted = false;
                push16(s.pc);
                s.pc = 0x0066;
                return mkRes(11, false, true);
            }
            if (pendingIRQ && s.iff1 && !iff1Pending && !blockIRQThisStep) {
                pendingIRQ = false;
                s.iff1 = false;
                s.halted = false;
                push16(s.pc);
                if (s.im === 2) {
                    // IM2: vector table lookup at (I << 8 | vector)
                    const ptr = (((s.i & 0xff) << 8) | (im2Vector & 0xff)) & 0xffff;
                    const lo = read8(ptr);
                    const hi = read8((ptr + 1) & 0xffff);
                    s.pc = ((hi << 8) | lo) & 0xffff;
                    return mkRes(19, true, false);
                }
                else if (s.im === 0) {
                    // IM0: execute injected opcode if provided (supporting only RST xx single-byte opcodes);
                    // otherwise, treat as RST 38h-style jump to im0Vector.
                    if (im0Opcode !== null) {
                        const opb = im0Opcode & 0xff;
                        const rstTargets = {
                            0xc7: 0x00,
                            0xcf: 0x08,
                            0xd7: 0x10,
                            0xdf: 0x18,
                            0xe7: 0x20,
                            0xef: 0x28,
                            0xf7: 0x30,
                            0xff: 0x38,
                        };
                        if (opb in rstTargets) {
                            s.pc = rstTargets[opb];
                            return mkRes(13, true, false);
                        }
                        throw new Error(`IM0 unsupported opcode 0x${opb.toString(16).padStart(2, '0')}`);
                    }
                    s.pc = im0Vector & 0xffff;
                    return mkRes(13, true, false);
                }
                else {
                    // IM1
                    s.pc = 0x0038;
                    return mkRes(13, true, false);
                }
            }
            // No interrupt accepted this step while halted: consume 4 cycles
            return mkRes(4, false, false);
        }
        // Not halted: peek next opcode to avoid preempting HALT for maskable IRQs.
        const nextOp = read8(s.pc) & 0xff;
        // Handle NMI first (always immediate if pending)
        if (pendingNMI) {
            pendingNMI = false;
            s.iff1 = false; // mask maskable IRQs
            s.halted = false;
            push16(s.pc);
            s.pc = 0x0066;
            return mkRes(11, false, true);
        }
        // Handle maskable IRQ when enabled and not in EI delay; defer if next op is HALT
        if (nextOp !== 0x76 && pendingIRQ && s.iff1 && !iff1Pending && !blockIRQThisStep) {
            pendingIRQ = false;
            s.iff1 = false;
            s.halted = false;
            push16(s.pc);
            if (s.im === 2) {
                // IM2: vector table lookup at (I << 8 | vector)
                const ptr = (((s.i & 0xff) << 8) | (im2Vector & 0xff)) & 0xffff;
                const lo = read8(ptr);
                const hi = read8((ptr + 1) & 0xffff);
                s.pc = ((hi << 8) | lo) & 0xffff;
                return mkRes(19, true, false);
            }
            else if (s.im === 0) {
                // IM0: execute injected opcode if provided (supporting only RST xx single-byte opcodes);
                // otherwise, treat as RST 38h-style jump to im0Vector.
                if (im0Opcode !== null) {
                    const opb = im0Opcode & 0xff;
                    const rstTargets = {
                        0xc7: 0x00,
                        0xcf: 0x08,
                        0xd7: 0x10,
                        0xdf: 0x18,
                        0xe7: 0x20,
                        0xef: 0x28,
                        0xf7: 0x30,
                        0xff: 0x38,
                    };
                    if (opb in rstTargets) {
                        s.pc = rstTargets[opb];
                        return mkRes(13, true, false);
                    }
                    throw new Error(`IM0 unsupported opcode 0x${opb.toString(16).padStart(2, '0')}`);
                }
                s.pc = im0Vector & 0xffff;
                return mkRes(13, true, false);
            }
            else {
                // IM1
                s.pc = 0x0038;
                return mkRes(13, true, false);
            }
        }
        const op = fetchOpcode();
        currOp = op & 0xff;
        // NOP
        if (op === 0x00) {
            return mkRes(4, false, false);
        }
        // JR d (0x18)
        if (op === 0x18) {
            const d = s8(fetch8());
            s.pc = (s.pc + d) & 0xffff;
            return mkRes(12, false, false);
        }
        // JR cc,d (0x20,0x28,0x30,0x38)
        if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
            const d = s8(fetch8());
            const cc = (op >>> 3) & 3; // 0:NZ,1:Z,2:NC,3:C
            const take = cond(cc);
            if (take)
                s.pc = (s.pc + d) & 0xffff;
            return mkRes(take ? 12 : 7, false, false);
        }
        // DJNZ d (0x10)
        if (op === 0x10) {
            const d = s8(fetch8());
            s.b = (s.b - 1) & 0xff;
            const take = s.b !== 0;
            if (take)
                s.pc = (s.pc + d) & 0xffff;
            return mkRes(take ? 13 : 8, false, false);
        }
        // JP nn (0xC3)
        if (op === 0xc3) {
            const lo = fetch8();
            const hi = fetch8();
            s.pc = ((hi << 8) | lo) & 0xffff;
            return mkRes(10, false, false);
        }
        // JP cc,nn (0xC2,0xCA,0xD2,0xDA,0xE2,0xEA,0xF2,0xFA)
        if ((op & 0xc7) === 0xc2) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            const cc = (op >>> 3) & 7;
            if (cond(cc))
                s.pc = nn;
            return mkRes(10, false, false);
        }
        // JP (HL) (0xE9)
        if (op === 0xe9) {
            s.pc = getHL();
            return mkRes(4, false, false);
        }
        // CALL nn (0xCD)
        if (op === 0xcd) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            push16(s.pc);
            s.pc = nn;
            return mkRes(17, false, false);
        }
        // CALL cc,nn (0xC4,0xCC,0xD4,0xDC,0xE4,0xEC,0xF4,0xFC)
        if ((op & 0xc7) === 0xc4) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            const cc = (op >>> 3) & 7;
            if (cond(cc)) {
                push16(s.pc);
                s.pc = nn;
                return mkRes(17, false, false);
            }
            return { cycles: 10, irqAccepted: false, nmiAccepted: false };
        }
        // RET (0xC9)
        if (op === 0xc9) {
            s.pc = pop16();
            return mkRes(10, false, false);
        }
        // RET cc (0xC0,0xC8,0xD0,0xD8,0xE0,0xE8,0xF0,0xF8)
        if ((op & 0xc7) === 0xc0) {
            const cc = (op >>> 3) & 7;
            if (cond(cc)) {
                s.pc = pop16();
                return mkRes(11, false, false);
            }
            return mkRes(5, false, false);
        }
        // RST p (0xC7,0xCF,0xD7,0xDF,0xE7,0xEF,0xF7,0xFF)
        if ((op & 0xc7) === 0xc7) {
            const target = op & 0x38;
            push16(s.pc);
            s.pc = target;
            return mkRes(11, false, false);
        }
        // CB prefix: rotates/shifts, BIT/RES/SET
        if (op === 0xcb) {
            const sub = fetchOpcode();
            const group = sub & 0xc0;
            const y = (sub >>> 3) & 7; // op selector or bit index
            const rCode = sub & 7; // register code (6 => (HL))
            const doWrite = (val) => {
                if (rCode === 6)
                    write8(getHL(), val & 0xff);
                else
                    regSet(rCode, val & 0xff);
            };
            const doRead = () => (rCode === 6 ? read8(getHL()) : regGet(rCode));
            // Rotate/shift group
            if (group === 0x00) {
                const v = doRead();
                let r = v;
                let c = 0;
                switch (y) {
                    case 0: // RLC
                        c = (v >>> 7) & 1;
                        r = ((v << 1) | c) & 0xff;
                        break;
                    case 1: // RRC
                        c = v & 1;
                        r = ((v >>> 1) | (c << 7)) & 0xff;
                        break;
                    case 2: {
                        // RL (through carry)
                        const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
                        c = (v >>> 7) & 1;
                        r = ((v << 1) | cPrev) & 0xff;
                        break;
                    }
                    case 3: {
                        // RR (through carry)
                        const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
                        c = v & 1;
                        r = ((v >>> 1) | (cPrev << 7)) & 0xff;
                        break;
                    }
                    case 4: // SLA
                        c = (v >>> 7) & 1;
                        r = (v << 1) & 0xff;
                        break;
                    case 5: // SRA
                        c = v & 1;
                        r = ((v >>> 1) | (v & 0x80)) & 0xff;
                        break;
                    case 6: // SLL (undocumented): like SLA, but set bit0 to 1
                        c = (v >>> 7) & 1;
                        r = ((v << 1) | 1) & 0xff;
                        break;
                    case 7: // SRL
                        c = v & 1;
                        r = (v >>> 1) & 0x7f;
                        break;
                }
                let f = setSZ53(r);
                if (parity8(r))
                    f |= FLAG_PV;
                // H=0, N=0
                if (c)
                    f |= FLAG_C;
                s.f = f;
                doWrite(r);
                const cycles = rCode === 6 ? 15 : 8;
                return mkRes(cycles, false, false);
            }
            // BIT group: test bit y in r
            if (group === 0x40) {
                const v = doRead();
                const mask = 1 << y;
                const bitSet = (v & mask) !== 0;
                let f = 0;
                if (!bitSet)
                    f |= FLAG_Z | FLAG_PV; // Z and PV follow test result
                if (y === 7 && bitSet)
                    f |= FLAG_S;
                f |= FLAG_H; // H set
                // Preserve C
                if (s.f & FLAG_C)
                    f |= FLAG_C;
                // Set undocumented 3/5 from operand
                if (v & 0x20)
                    f |= FLAG_5;
                if (v & 0x08)
                    f |= FLAG_3;
                s.f = f;
                const cycles = rCode === 6 ? 12 : 8;
                return mkRes(cycles, false, false);
            }
            // RES group: reset bit y
            if (group === 0x80) {
                const v = doRead();
                const r = v & (~(1 << y) & 0xff);
                doWrite(r);
                const cycles = rCode === 6 ? 15 : 8;
                return mkRes(cycles, false, false);
            }
            // SET group: set bit y
            {
                const v = doRead();
                const r = v | (1 << y);
                doWrite(r);
                const cycles = rCode === 6 ? 15 : 8;
                return mkRes(cycles, false, false);
            }
        }
        // ED prefix
        if (op === 0xed) {
            const sub = fetchOpcode();
            // ADC HL,ss (ED 4A/5A/6A/7A)
            if ((sub & 0xcf) === 0x4a) {
                const sel = (sub >>> 4) & 0x03; // 0:BC,1:DE,2:HL,3:SP
                const ss = sel === 0
                    ? (s.b << 8) | s.c
                    : sel === 1
                        ? (s.d << 8) | s.e
                        : sel === 2
                            ? (s.h << 8) | s.l
                            : s.sp;
                const a = (s.h << 8) | s.l;
                const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
                const sum = a + ss + carry;
                const r16 = sum & 0xffff;
                // Flags
                let f = 0;
                if (r16 & 0x8000)
                    f |= FLAG_S;
                if (r16 === 0)
                    f |= FLAG_Z;
                if ((((a ^ ss ^ r16) >>> 12) & 1) !== 0)
                    f |= FLAG_H; // half carry from bit 11
                if (~(a ^ ss) & (a ^ r16) & 0x8000)
                    f |= FLAG_PV;
                if (sum > 0xffff)
                    f |= FLAG_C;
                // N=0
                // undocumented 3/5 from high byte
                const hi = (r16 >>> 8) & 0xff;
                if (hi & 0x20)
                    f |= FLAG_5;
                if (hi & 0x08)
                    f |= FLAG_3;
                s.h = (r16 >>> 8) & 0xff;
                s.l = r16 & 0xff;
                s.f = f;
                return mkRes(15, false, false);
            }
            // SBC HL,ss (ED 42/52/62/72)
            if ((sub & 0xcf) === 0x42) {
                const sel = (sub >>> 4) & 0x03;
                const ss = sel === 0
                    ? (s.b << 8) | s.c
                    : sel === 1
                        ? (s.d << 8) | s.e
                        : sel === 2
                            ? (s.h << 8) | s.l
                            : s.sp;
                const a = (s.h << 8) | s.l;
                const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
                const diff = a - ss - carry;
                const r16 = diff & 0xffff;
                let f = FLAG_N;
                if (r16 & 0x8000)
                    f |= FLAG_S;
                if (r16 === 0)
                    f |= FLAG_Z;
                if ((((a ^ ss ^ r16) >>> 12) & 1) !== 0)
                    f |= FLAG_H; // half borrow
                if ((a ^ ss) & (a ^ r16) & 0x8000)
                    f |= FLAG_PV;
                if (a < ss + carry)
                    f |= FLAG_C;
                const hi = (r16 >>> 8) & 0xff;
                if (hi & 0x20)
                    f |= FLAG_5;
                if (hi & 0x08)
                    f |= FLAG_3;
                s.h = (r16 >>> 8) & 0xff;
                s.l = r16 & 0xff;
                s.f = f;
                return mkRes(15, false, false);
            }
            // LD (nn), ss (ED 43/53/63/73)
            if ((sub & 0xcf) === 0x43) {
                const sel = (sub >>> 4) & 0x03;
                const lo = fetch8();
                const hi = fetch8();
                const nn = ((hi << 8) | lo) & 0xffff;
                const val = sel === 0
                    ? (s.b << 8) | s.c
                    : sel === 1
                        ? (s.d << 8) | s.e
                        : sel === 2
                            ? (s.h << 8) | s.l
                            : s.sp;
                write16(nn, val);
                return mkRes(20, false, false);
            }
            // LD ss, (nn) (ED 4B/5B/6B/7B)
            if ((sub & 0xcf) === 0x4b) {
                const sel = (sub >>> 4) & 0x03;
                const lo = fetch8();
                const hi = fetch8();
                const nn = ((hi << 8) | lo) & 0xffff;
                const val = read16(nn);
                if (sel === 0) {
                    s.b = (val >>> 8) & 0xff;
                    s.c = val & 0xff;
                }
                else if (sel === 1) {
                    s.d = (val >>> 8) & 0xff;
                    s.e = val & 0xff;
                }
                else if (sel === 2) {
                    s.h = (val >>> 8) & 0xff;
                    s.l = val & 0xff;
                }
                else {
                    s.sp = val;
                }
                return mkRes(20, false, false);
            }
            // NEG (multiple encodings ED 44/4C/54/5C/64/6C/74/7C)
            if ((sub & 0xe7) === 0x44) {
                const { r, f } = sub8(0, s.a, 0);
                s.a = r;
                s.f = f;
                return mkRes(8, false, false);
            }
            // RETN (ED 45) or RETI (ED 4D)
            if (sub === 0x45 || sub === 0x4d) {
                s.pc = pop16();
                // For RETN, IFF1 := IFF2; for RETI, identical on Z80
                s.iff1 = s.iff2;
                return mkRes(14, false, false);
            }
            // IM 0/1/2
            if (sub === 0x46 || sub === 0x66 || sub === 0x76) {
                s.im = 0;
                return { cycles: 8, irqAccepted: false, nmiAccepted: false };
            }
            if (sub === 0x56) {
                s.im = 1;
                return { cycles: 8, irqAccepted: false, nmiAccepted: false };
            }
            if (sub === 0x5e) {
                s.im = 2;
                return { cycles: 8, irqAccepted: false, nmiAccepted: false };
            }
            // LD I,A (ED 47) and LD R,A (ED 4F)
            if (sub === 0x47) {
                s.i = s.a & 0xff;
                return mkRes(9, false, false);
            }
            if (sub === 0x4f) {
                s.r = s.a & 0xff;
                return mkRes(9, false, false);
            }
            // IN r,(C) (ED 40/48/50/58/60/68/70/78)
            if ((sub & 0xc7) === 0x40) {
                const rCode = (sub >>> 3) & 7;
                const v = readIO8(s.c & 0xff) & 0xff;
                if (rCode !== 6) {
                    regSet(rCode, v);
                }
                // Flags: S,Z,PV from v; H=0,N=0; C preserved; F3/F5 from v
                let f = setSZ53(v);
                if (parity8(v))
                    f |= FLAG_PV;
                if (s.f & FLAG_C)
                    f |= FLAG_C;
                s.f = f;
                return mkRes(12, false, false);
            }
            // OUT (C),r (ED 41/49/51/59/61/69/71/79)
            if ((sub & 0xc7) === 0x41) {
                const rCode = (sub >>> 3) & 7;
                const v = rCode === 6 ? 0 : regGet(rCode);
                writeIO8(s.c & 0xff, v & 0xff);
                // Flags unaffected
                return mkRes(12, false, false);
            }
            // LD A,I (ED 57) and LD A,R (ED 5F)
            if (sub === 0x57 || sub === 0x5f) {
                s.a = (sub === 0x57 ? s.i : s.r) & 0xff;
                let f = setSZ53(s.a);
                if (s.iff2)
                    f |= FLAG_PV;
                // H=0, N=0, C preserved
                if (s.f & FLAG_C)
                    f |= FLAG_C;
                s.f = f;
                return mkRes(9, false, false);
            }
            // Block transfer: LDI/LDD/LDIR/LDDR
            if (sub === 0xa0 || sub === 0xa8 || sub === 0xb0 || sub === 0xb8) {
                // Fast path for LDIR/LDDR when enabled: collapse repeats until BC==0.
                const isRepeat = sub === 0xb0 || sub === 0xb8;
                if (isRepeat && opts.experimentalFastBlockOps) {
                    // Compute current HL/DE/BC
                    let hl = ((s.h << 8) | s.l) & 0xffff;
                    let de = ((s.d << 8) | s.e) & 0xffff;
                    let bc = ((s.b << 8) | s.c) & 0xffff;
                    if (bc === 0) {
                        // Degenerate: behave like final iteration
                        const val0 = read8(hl);
                        write8(de, val0);
                        if (sub === 0xb0) { // LDIR increment
                            hl = (hl + 1) & 0xffff;
                            de = (de + 1) & 0xffff;
                        }
                        else { // LDDR decrement
                            hl = (hl - 1) & 0xffff;
                            de = (de - 1) & 0xffff;
                        }
                        bc = (bc - 1) & 0xffff;
                        s.h = (hl >>> 8) & 0xff;
                        s.l = hl & 0xff;
                        s.d = (de >>> 8) & 0xff;
                        s.e = de & 0xff;
                        s.b = (bc >>> 8) & 0xff;
                        s.c = bc & 0xff;
                        let f0 = s.f & (FLAG_S | FLAG_Z | FLAG_C);
                        const sum0 = (s.a + val0) & 0xff;
                        if (sum0 & 0x08)
                            f0 |= FLAG_3;
                        if (sum0 & 0x20)
                            f0 |= FLAG_5;
                        s.f = f0; // PV cleared since BC became zero
                        return mkRes(16, false, false);
                    }
                    // Number of iterations to finish
                    const count = bc;
                    let lastVal = 0;
                    for (let i = 0; i < count; i++) {
                        const v = read8(hl);
                        write8(de, v);
                        lastVal = v;
                        if (sub === 0xb0) { // LDIR increment
                            hl = (hl + 1) & 0xffff;
                            de = (de + 1) & 0xffff;
                        }
                        else { // LDDR decrement
                            hl = (hl - 1) & 0xffff;
                            de = (de - 1) & 0xffff;
                        }
                    }
                    // Update regs after all iterations
                    s.h = (hl >>> 8) & 0xff;
                    s.l = hl & 0xff;
                    s.d = (de >>> 8) & 0xff;
                    s.e = de & 0xff;
                    s.b = 0;
                    s.c = 0;
                    // Flags at end: H=0,N=0, C/S/Z preserved, PV=0, F3/F5 from (A+lastVal)
                    let f = s.f & (FLAG_S | FLAG_Z | FLAG_C);
                    const sum = (s.a + lastVal) & 0xff;
                    if (sum & 0x08)
                        f |= FLAG_3;
                    if (sum & 0x20)
                        f |= FLAG_5;
                    s.f = f;
                    // Cycles: (count-1)*21 + 16
                    const totalCycles = (count > 0 ? ((count - 1) * 21 + 16) : 16);
                    // Advance PC past instruction (do not repeat)
                    s.pc = (s.pc + 2) & 0xffff;
                    return mkRes(totalCycles, false, false);
                }
                // Default: one-iteration behavior
                // Read byte from (HL), write to (DE)
                const hl = ((s.h << 8) | s.l) & 0xffff;
                const de = ((s.d << 8) | s.e) & 0xffff;
                const val = read8(hl);
                write8(de, val);
                // Update HL/DE
                if (sub === 0xa0 || sub === 0xb0) {
                    // LDI/LDIR: increment
                    const hl2 = (hl + 1) & 0xffff;
                    const de2 = (de + 1) & 0xffff;
                    s.h = (hl2 >>> 8) & 0xff;
                    s.l = hl2 & 0xff;
                    s.d = (de2 >>> 8) & 0xff;
                    s.e = de2 & 0xff;
                }
                else {
                    // LDD/LDDR: decrement
                    const hl2 = (hl - 1) & 0xffff;
                    const de2 = (de - 1) & 0xffff;
                    s.h = (hl2 >>> 8) & 0xff;
                    s.l = hl2 & 0xff;
                    s.d = (de2 >>> 8) & 0xff;
                    s.e = de2 & 0xff;
                }
                // BC--
                const bc = (((s.b << 8) | s.c) - 1) & 0xffff;
                s.b = (bc >>> 8) & 0xff;
                s.c = bc & 0xff;
                // Flags: H=0, N=0, C/S/Z preserved, PV=(BC!=0), F3/F5 from (A+val)
                let f = s.f & (FLAG_S | FLAG_Z | FLAG_C);
                if (bc !== 0)
                    f |= FLAG_PV;
                const sum = (s.a + val) & 0xff;
                if (sum & 0x08)
                    f |= FLAG_3;
                if (sum & 0x20)
                    f |= FLAG_5;
                s.f = f;
                // LDIR/LDDR repeat behavior
                const isRepeat2 = sub === 0xb0 || sub === 0xb8;
                if (isRepeat2 && bc !== 0) {
                    s.pc = (s.pc - 2) & 0xffff;
                    return mkRes(21, false, false);
                }
                return mkRes(16, false, false);
            }
            // Block compare: CPI/CPD/CPIR/CPDR
            if (sub === 0xa1 || sub === 0xa9 || sub === 0xb1 || sub === 0xb9) {
                const hl = ((s.h << 8) | s.l) & 0xffff;
                const val = read8(hl);
                const r = (s.a - val) & 0xff;
                const hb = (s.a & 0x0f) - (val & 0x0f) < 0;
                // Update HL +/- 1
                if (sub === 0xa1 || sub === 0xb1) {
                    const hl2 = (hl + 1) & 0xffff;
                    s.h = (hl2 >>> 8) & 0xff;
                    s.l = hl2 & 0xff;
                }
                else {
                    const hl2 = (hl - 1) & 0xffff;
                    s.h = (hl2 >>> 8) & 0xff;
                    s.l = hl2 & 0xff;
                }
                // BC--
                const bc = (((s.b << 8) | s.c) - 1) & 0xffff;
                s.b = (bc >>> 8) & 0xff;
                s.c = bc & 0xff;
                // Flags: S/Z from r; H from hb; N=1; C preserved; PV=(BC!=0 && r!=0)? Actually PV=(BC!=0)
                let f = 0;
                if (r & 0x80)
                    f |= FLAG_S;
                if (r === 0)
                    f |= FLAG_Z;
                if (hb)
                    f |= FLAG_H;
                f |= FLAG_N;
                // Preserve C
                if (s.f & FLAG_C)
                    f |= FLAG_C;
                // PV set if BC != 0
                if (bc !== 0)
                    f |= FLAG_PV;
                // Undocumented: F3/F5 from (r - H)
                const adj = (r - (hb ? 1 : 0)) & 0xff;
                if (adj & 0x08)
                    f |= FLAG_3;
                if (adj & 0x20)
                    f |= FLAG_5;
                s.f = f;
                const isRepeat = sub === 0xb1 || sub === 0xb9;
                if (isRepeat && bc !== 0 && r !== 0) {
                    s.pc = (s.pc - 2) & 0xffff;
                    return mkRes(21, false, false);
                }
                return mkRes(16, false, false);
            }
            // I/O block transfer: INI/IND/INIR/INDR/OUTI/OUTD/OTIR/OTDR
            if (sub === 0xa2 || // INI
                sub === 0xaa || // IND
                sub === 0xb2 || // INIR
                sub === 0xba || // INDR
                sub === 0xa3 || // OUTI
                sub === 0xab || // OUTD
                sub === 0xb3 || // OTIR
                sub === 0xbb // OTDR
            ) {
                const isIn = sub === 0xa2 || sub === 0xaa || sub === 0xb2 || sub === 0xba;
                const isRepeat = sub === 0xb2 || sub === 0xba || sub === 0xb3 || sub === 0xbb;
                const isDec = sub === 0xaa || sub === 0xba || sub === 0xab || sub === 0xbb;
                const hl = ((s.h << 8) | s.l) & 0xffff;
                const cVal = s.c & 0xff;
                // Read/write value
                let ioVal = 0;
                if (isIn) {
                    ioVal = readIO8(cVal) & 0xff;
                    write8(hl, ioVal);
                }
                else {
                    ioVal = read8(hl) & 0xff;
                    writeIO8(cVal, ioVal);
                }
                // Update HL (+/- 1)
                const hl2 = isDec ? ((hl - 1) & 0xffff) : ((hl + 1) & 0xffff);
                s.h = (hl2 >>> 8) & 0xff;
                s.l = hl2 & 0xff;
                // Decrement B
                const b2 = (s.b - 1) & 0xff;
                s.b = b2;
                // Compute helper t used for H/C and F3/F5 (common emulator formula)
                const cAdj = isDec ? ((cVal - 1) & 0xff) : ((cVal + 1) & 0xff);
                const sum = ioVal + cAdj;
                const t = sum & 0xff;
                const carry = sum > 0xff;
                // Flags per Z80 behavior approximation for block I/O:
                // - S/Z reflect B' (after decrement)
                // - PV set if B' != 0
                // - H and C set from carry of (ioVal + (C±1))
                // - N: for INx, set; for OUTx, set from bit7 of ioVal (approximation)
                // - F3/F5 from t (undocumented)
                let f = 0;
                if (b2 & 0x80)
                    f |= FLAG_S;
                if (b2 === 0)
                    f |= FLAG_Z;
                if (b2 !== 0)
                    f |= FLAG_PV;
                if (carry)
                    f |= FLAG_H | FLAG_C;
                if (isIn) {
                    f |= FLAG_N; // INI/IND set N
                }
                else {
                    if (ioVal & 0x80)
                        f |= FLAG_N; // OUTI/OUTD set N from bit7 of data (approx)
                }
                if (t & 0x20)
                    f |= FLAG_5;
                if (t & 0x08)
                    f |= FLAG_3;
                s.f = f & 0xff;
                // Repeat handling
                if (isRepeat && b2 !== 0) {
                    s.pc = (s.pc - 2) & 0xffff;
                    return mkRes(21, false, false);
                }
                return mkRes(16, false, false);
            }
            // RRD (ED 67)
            if (sub === 0x67) {
                const hl = ((s.h << 8) | s.l) & 0xffff;
                const m = read8(hl) & 0xff;
                const aLow = s.a & 0x0f;
                const newM = ((aLow << 4) | (m >>> 4)) & 0xff;
                write8(hl, newM);
                s.a = (s.a & 0xf0) | (m & 0x0f);
                // Flags from A, C preserved
                let f = setSZ53(s.a);
                if (parity8(s.a))
                    f |= FLAG_PV;
                if (s.f & FLAG_C)
                    f |= FLAG_C;
                s.f = f;
                return mkRes(18, false, false);
            }
            // RLD (ED 6F)
            if (sub === 0x6f) {
                const hl = ((s.h << 8) | s.l) & 0xffff;
                const m = read8(hl) & 0xff;
                const aLow = s.a & 0x0f;
                const newM = ((m << 4) | aLow) & 0xff;
                write8(hl, newM);
                s.a = (s.a & 0xf0) | ((m >>> 4) & 0x0f);
                // Flags from A, C preserved
                let f = setSZ53(s.a);
                if (parity8(s.a))
                    f |= FLAG_PV;
                if (s.f & FLAG_C)
                    f |= FLAG_C;
                s.f = f;
                return mkRes(18, false, false);
            }
            // Unimplemented ED opcode
            throw new Error(`Unimplemented ED opcode 0x${sub.toString(16).padStart(2, '0')} at PC=0x${(s.pc - 2)
                .toString(16)
                .padStart(4, '0')}`);
        }
        // DD/FD prefix (IX/IY)
        if (op === 0xdd || op === 0xfd) {
            const isIX = op === 0xdd;
            const indexVal = () => (isIX ? s.ix : s.iy) & 0xffff;
            const op2 = fetchOpcode();
            // Helpers for DD/FD 8-bit register mapping (H/L -> IXH/IYH and IXL/IYL)
            const xyh = () => ((isIX ? s.ix : s.iy) >>> 8) & 0xff;
            const xyl = () => (isIX ? s.ix : s.iy) & 0xff;
            const setXYH = (v) => {
                const base = isIX ? s.ix : s.iy;
                const nv = ((v & 0xff) << 8) | (base & 0xff);
                if (isIX)
                    s.ix = nv & 0xffff;
                else
                    s.iy = nv & 0xffff;
            };
            const setXYL = (v) => {
                const base = isIX ? s.ix : s.iy;
                const nv = ((base & 0xff00) | (v & 0xff)) & 0xffff;
                if (isIX)
                    s.ix = nv;
                else
                    s.iy = nv;
            };
            const ddRegGet = (code) => {
                switch (code & 7) {
                    case 0: return s.b & 0xff;
                    case 1: return s.c & 0xff;
                    case 2: return s.d & 0xff;
                    case 3: return s.e & 0xff;
                    case 4: return xyh();
                    case 5: return xyl();
                    case 7: return s.a & 0xff;
                    default: /* 6 handled elsewhere */ return 0;
                }
            };
            const ddRegSet = (code, val) => {
                const v = val & 0xff;
                switch (code & 7) {
                    case 0:
                        s.b = v;
                        break;
                    case 1:
                        s.c = v;
                        break;
                    case 2:
                        s.d = v;
                        break;
                    case 3:
                        s.e = v;
                        break;
                    case 4:
                        setXYH(v);
                        break;
                    case 5:
                        setXYL(v);
                        break;
                    case 7:
                        s.a = v;
                        break;
                }
            };
            // IX/IY 16-bit LD and arithmetic
            if (op2 === 0x21) { // LD IX/IY,nn
                const lo = fetch8();
                const hi = fetch8();
                if (isIX)
                    s.ix = ((hi << 8) | lo) & 0xffff;
                else
                    s.iy = ((hi << 8) | lo) & 0xffff;
                return mkRes(14, false, false);
            }
            if (op2 === 0x23) { // INC IX/IY
                if (isIX)
                    s.ix = (s.ix + 1) & 0xffff;
                else
                    s.iy = (s.iy + 1) & 0xffff;
                return mkRes(10, false, false);
            }
            if (op2 === 0x2b) { // DEC IX/IY
                if (isIX)
                    s.ix = (s.ix - 1) & 0xffff;
                else
                    s.iy = (s.iy - 1) & 0xffff;
                return mkRes(10, false, false);
            }
            if (op2 === 0x22) { // LD (nn),IX/IY
                const lo = fetch8();
                const hi = fetch8();
                const nn = ((hi << 8) | lo) & 0xffff;
                const val = isIX ? s.ix : s.iy;
                write16(nn, val);
                return mkRes(20, false, false);
            }
            if (op2 === 0x2a) { // LD IX/IY,(nn)
                const lo = fetch8();
                const hi = fetch8();
                const nn = ((hi << 8) | lo) & 0xffff;
                const val = read16(nn);
                if (isIX)
                    s.ix = val;
                else
                    s.iy = val;
                return mkRes(20, false, false);
            }
            if ((op2 & 0xcf) === 0x09) { // ADD IX/IY,pp
                const pp = (op2 >>> 4) & 3;
                const a = isIX ? s.ix : s.iy;
                const ppVal = pp === 0 ? ((s.b << 8) | s.c) & 0xffff : pp === 1 ? ((s.d << 8) | s.e) & 0xffff : pp === 2 ? (isIX ? s.ix : s.iy) : s.sp;
                const sum = a + ppVal;
                const r16 = sum & 0xffff;
                let f = s.f & (FLAG_S | FLAG_Z | FLAG_PV);
                if ((((a ^ ppVal ^ r16) >>> 12) & 1) !== 0)
                    f |= FLAG_H;
                if (sum > 0xffff)
                    f |= FLAG_C;
                const hi = (r16 >>> 8) & 0xff;
                if (hi & 0x20)
                    f |= FLAG_5;
                if (hi & 0x08)
                    f |= FLAG_3;
                if (isIX)
                    s.ix = r16;
                else
                    s.iy = r16;
                s.f = f;
                return mkRes(15, false, false);
            }
            if (op2 === 0xf9) { // LD SP,IX/IY
                s.sp = (isIX ? s.ix : s.iy) & 0xffff;
                return mkRes(10, false, false);
            }
            if (op2 === 0xe5) { // PUSH IX/IY
                push16(indexVal());
                return mkRes(15, false, false);
            }
            if (op2 === 0xe1) { // POP IX/IY
                const val = pop16();
                if (isIX)
                    s.ix = val;
                else
                    s.iy = val;
                return mkRes(14, false, false);
            }
            if (op2 === 0xe3) { // EX (SP),IX/IY
                const lo = read8(s.sp);
                const hi = read8((s.sp + 1) & 0xffff);
                const idx = isIX ? s.ix : s.iy;
                write8(s.sp, idx & 0xff);
                write8((s.sp + 1) & 0xffff, (idx >>> 8) & 0xff);
                const val = ((hi << 8) | lo) & 0xffff;
                if (isIX)
                    s.ix = val;
                else
                    s.iy = val;
                return mkRes(23, false, false);
            }
            // DD/FD CB d op
            if (op2 === 0xcb) {
                const d = fetch8();
                const sub = fetchOpcode();
                const group = sub & 0xc0;
                const y = (sub >>> 3) & 7;
                const rCode = sub & 7;
                const addr = (indexVal() + s8(d)) & 0xffff;
                const v = read8(addr);
                if (group === 0x00) {
                    // Rotates/shifts
                    let r = v;
                    let c = 0;
                    switch (y) {
                        case 0: // RLC
                            c = (v >>> 7) & 1;
                            r = ((v << 1) | c) & 0xff;
                            break;
                        case 1: // RRC
                            c = v & 1;
                            r = ((v >>> 1) | (c << 7)) & 0xff;
                            break;
                        case 2: {
                            // RL
                            const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
                            c = (v >>> 7) & 1;
                            r = ((v << 1) | cPrev) & 0xff;
                            break;
                        }
                        case 3: {
                            // RR
                            const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
                            c = v & 1;
                            r = ((v >>> 1) | (cPrev << 7)) & 0xff;
                            break;
                        }
                        case 4: // SLA
                            c = (v >>> 7) & 1;
                            r = (v << 1) & 0xff;
                            break;
                        case 5: // SRA
                            c = v & 1;
                            r = ((v >>> 1) | (v & 0x80)) & 0xff;
                            break;
                        case 6: // SLL (undocumented)
                            c = (v >>> 7) & 1;
                            r = ((v << 1) | 1) & 0xff;
                            break;
                        case 7: // SRL
                            c = v & 1;
                            r = (v >>> 1) & 0x7f;
                            break;
                    }
                    let f = setSZ53(r);
                    if (parity8(r))
                        f |= FLAG_PV;
                    if (c)
                        f |= FLAG_C;
                    s.f = f;
                    write8(addr, r);
                    if (rCode !== 6)
                        regSet(rCode, r);
                    return mkRes(23, false, false);
                }
                if (group === 0x40) {
                    // BIT y,(IX/IY+d)
                    const mask = 1 << y;
                    const bitSet = (v & mask) !== 0;
                    let f = 0;
                    if (!bitSet)
                        f |= FLAG_Z | FLAG_PV;
                    if (y === 7 && bitSet)
                        f |= FLAG_S;
                    f |= FLAG_H;
                    if (s.f & FLAG_C)
                        f |= FLAG_C;
                    if (v & 0x20)
                        f |= FLAG_5;
                    if (v & 0x08)
                        f |= FLAG_3;
                    s.f = f;
                    return mkRes(20, false, false);
                }
                // RES/SET y,(IX/IY+d) and optional transfer to r
                if (group === 0x80 || group === 0xc0) {
                    let newV = v;
                    if (group === 0x80)
                        newV = v & (~(1 << y) & 0xff);
                    else
                        newV = v | (1 << y);
                    write8(addr, newV);
                    if (rCode !== 6)
                        regSet(rCode, newV);
                    return mkRes(23, false, false);
                }
                // Should not reach here
                /* c8 ignore next */
                throw new Error(`Unimplemented ${isIX ? 'DD' : 'FD'} CB opcode 0x${sub
                    .toString(16)
                    .padStart(2, '0')} at PC=0x${(s.pc - 4).toString(16).padStart(4, '0')}`);
            }
            // JP (IX/IY) : 0xE9
            if (op2 === 0xe9) {
                s.pc = indexVal();
                return mkRes(8, false, false);
            }
            // LD (IX+d),n : 0x36
            if (op2 === 0x36) {
                const d = fetch8();
                const n = fetch8();
                const addr = (indexVal() + s8(d)) & 0xffff;
                write8(addr, n & 0xff);
                return mkRes(19, false, false);
            }
            // INC (IX+d) / DEC (IX+d)
            if (op2 === 0x34 || op2 === 0x35) {
                const d = fetch8();
                const addr = (indexVal() + s8(d)) & 0xffff;
                const val = read8(addr);
                if (op2 === 0x34) {
                    const { r, f } = inc8(val, s.f);
                    write8(addr, r);
                    s.f = f;
                }
                else {
                    const { r, f } = dec8(val, s.f);
                    write8(addr, r);
                    s.f = f;
                }
                return mkRes(23, false, false);
            }
            // INC r / DEC r (including IXH/IXL or IYH/IYL)
            if ((op2 & 0xc7) === 0x04 || (op2 & 0xc7) === 0x05) {
                const isDec = (op2 & 0xc7) === 0x05;
                const rCode = (op2 >>> 3) & 7;
                if (rCode === 6) {
                    // This form would be 0x34/0x35 and handled above
                }
                else {
                    if (rCode === 4 || rCode === 5) {
                        const v = ddRegGet(rCode);
                        const { r, f } = isDec ? dec8(v, s.f) : inc8(v, s.f);
                        ddRegSet(rCode, r);
                        s.f = f;
                        return mkRes(4, false, false);
                    }
                    else {
                        // Regular registers under DD/FD behave like normal
                        const v = regGet(rCode);
                        const { r, f } = isDec ? dec8(v, s.f) : inc8(v, s.f);
                        regSet(rCode, r);
                        s.f = f;
                        return mkRes(4, false, false);
                    }
                }
            }
            // LD r,n (including IXH/IXL or IYH/IYL)
            if ((op2 & 0xc7) === 0x06) {
                const rCode = (op2 >>> 3) & 7;
                const imm = fetch8();
                if (rCode === 6) {
                    // This is LD (IX+d),n handled above (0x36)
                }
                else if (rCode === 4 || rCode === 5) {
                    ddRegSet(rCode, imm);
                    return mkRes(7, false, false);
                }
                else {
                    regSet(rCode, imm);
                    return mkRes(7, false, false);
                }
            }
            // LD r,(IX+d) and LD (IX+d),r using LD r,r' matrix when one side is (HL)
            if ((op2 & 0xc0) === 0x40) {
                const rDst = (op2 >>> 3) & 7;
                const rSrc = op2 & 7;
                if (rSrc === 6 || rDst === 6) {
                    const d = fetch8();
                    const addr = (indexVal() + s8(d)) & 0xffff;
                    if (rSrc === 6) {
                        const v = read8(addr);
                        // destination may be IXH/IXL mapping
                        if (rDst === 4 || rDst === 5)
                            ddRegSet(rDst, v);
                        else
                            regSet(rDst, v);
                        return mkRes(19, false, false);
                    }
                    else {
                        const v = (rSrc === 4 || rSrc === 5) ? ddRegGet(rSrc) : regGet(rSrc);
                        write8(addr, v);
                        return mkRes(19, false, false);
                    }
                }
                // Pure register transfer including IXH/IXL or IYH/IYL
                const v = (rSrc === 4 || rSrc === 5) ? ddRegGet(rSrc) : regGet(rSrc);
                if (rDst === 4 || rDst === 5)
                    ddRegSet(rDst, v);
                else
                    regSet(rDst, v);
                return mkRes(4, false, false);
            }
            // Arithmetic groups: allow r being IXH/IXL/IYH/IYL or (IX/IY+d)
            const arithSrc = op2 & 7;
            if ((op2 & 0xf8) === 0x80 ||
                (op2 & 0xf8) === 0x88 ||
                (op2 & 0xf8) === 0x90 ||
                (op2 & 0xf8) === 0x98 ||
                (op2 & 0xf8) === 0xa0 ||
                (op2 & 0xf8) === 0xa8 ||
                (op2 & 0xf8) === 0xb0 ||
                (op2 & 0xf8) === 0xb8) {
                if (arithSrc === 6) {
                    const d = fetch8();
                    const b = read8((indexVal() + s8(d)) & 0xffff);
                    if ((op2 & 0xf8) === 0x80) {
                        const { r, f } = add8(s.a, b, 0);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0x88) {
                        const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
                        const { r, f } = add8(s.a, b, carry);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0x90) {
                        const { r, f } = sub8(s.a, b, 0);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0x98) {
                        const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
                        const { r, f } = sub8(s.a, b, carry);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0xa0) {
                        const r = s.a & b;
                        s.a = r;
                        s.f = logicFlags(r, 1);
                    }
                    else if ((op2 & 0xf8) === 0xa8) {
                        const r = s.a ^ b;
                        s.a = r;
                        s.f = logicFlags(r, 0);
                    }
                    else if ((op2 & 0xf8) === 0xb0) {
                        const r = s.a | b;
                        s.a = r;
                        s.f = logicFlags(r, 0);
                    }
                    else {
                        const { f } = sub8(s.a, b, 0);
                        s.f = f;
                    }
                    return mkRes(19, false, false);
                }
                else {
                    const b = (arithSrc === 4 || arithSrc === 5) ? ddRegGet(arithSrc) : regGet(arithSrc);
                    if ((op2 & 0xf8) === 0x80) {
                        const { r, f } = add8(s.a, b, 0);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0x88) {
                        const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
                        const { r, f } = add8(s.a, b, carry);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0x90) {
                        const { r, f } = sub8(s.a, b, 0);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0x98) {
                        const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
                        const { r, f } = sub8(s.a, b, carry);
                        s.a = r;
                        s.f = f;
                    }
                    else if ((op2 & 0xf8) === 0xa0) {
                        const r = s.a & b;
                        s.a = r;
                        s.f = logicFlags(r, 1);
                    }
                    else if ((op2 & 0xf8) === 0xa8) {
                        const r = s.a ^ b;
                        s.a = r;
                        s.f = logicFlags(r, 0);
                    }
                    else if ((op2 & 0xf8) === 0xb0) {
                        const r = s.a | b;
                        s.a = r;
                        s.f = logicFlags(r, 0);
                    }
                    else {
                        const { f } = sub8(s.a, b, 0);
                        s.f = f;
                    }
                    return mkRes(4, false, false);
                }
            }
            // Fallback: unimplemented DD/FD opcode
            throw new Error(`Unimplemented ${isIX ? 'DD' : 'FD'} opcode 0x${op2
                .toString(16)
                .padStart(2, '0')} at PC=0x${(s.pc - 2).toString(16).padStart(4, '0')}`);
        }
        // HALT
        if (op === 0x76) {
            s.halted = true;
            // EI pending commit after this instruction if set
            if (iff1Pending) {
                s.iff1 = true;
                s.iff2 = true;
                iff1Pending = false;
            }
            return mkRes(4, false, false);
        }
        // LD r,r' (01 rrr sss), except HALT handled above
        if ((op & 0xc0) === 0x40) {
            const rDst = (op >>> 3) & 7;
            const rSrc = op & 7;
            const v = regGet(rSrc);
            regSet(rDst, v);
            const hasMem = rDst === 6 || rSrc === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // LD dd,nn (00 dd 0001) dd: 00:BC,01:DE,10:HL,11:SP
        if ((op & 0xcf) === 0x01) {
            const dd = (op >>> 4) & 3;
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            if (dd === 0) {
                s.b = (nn >>> 8) & 0xff;
                s.c = nn & 0xff;
            }
            else if (dd === 1) {
                s.d = (nn >>> 8) & 0xff;
                s.e = nn & 0xff;
            }
            else if (dd === 2) {
                s.h = (nn >>> 8) & 0xff;
                s.l = nn & 0xff;
            }
            else {
                s.sp = nn;
            }
            return mkRes(10, false, false);
        }
        // LD r, n (00 rrr 110)
        if ((op & 0xc7) === 0x06) {
            const rDst = (op >>> 3) & 7;
            const imm = fetch8();
            regSet(rDst, imm);
            return mkRes(7, false, false);
        }
        // INC dd (00 dd 0011)
        if ((op & 0xcf) === 0x03) {
            const dd = (op >>> 4) & 3;
            if (dd === 0) {
                const bc = (((s.b << 8) | s.c) + 1) & 0xffff;
                s.b = (bc >>> 8) & 0xff;
                s.c = bc & 0xff;
            }
            else if (dd === 1) {
                const de = (((s.d << 8) | s.e) + 1) & 0xffff;
                s.d = (de >>> 8) & 0xff;
                s.e = de & 0xff;
            }
            else if (dd === 2) {
                const hl = (((s.h << 8) | s.l) + 1) & 0xffff;
                s.h = (hl >>> 8) & 0xff;
                s.l = hl & 0xff;
            }
            else {
                s.sp = (s.sp + 1) & 0xffff;
            }
            return mkRes(6, false, false);
        }
        // DEC dd (00 dd 1011)
        if ((op & 0xcf) === 0x0b) {
            const dd = (op >>> 4) & 3;
            if (dd === 0) {
                const bc = (((s.b << 8) | s.c) - 1) & 0xffff;
                s.b = (bc >>> 8) & 0xff;
                s.c = bc & 0xff;
            }
            else if (dd === 1) {
                const de = (((s.d << 8) | s.e) - 1) & 0xffff;
                s.d = (de >>> 8) & 0xff;
                s.e = de & 0xff;
            }
            else if (dd === 2) {
                const hl = (((s.h << 8) | s.l) - 1) & 0xffff;
                s.h = (hl >>> 8) & 0xff;
                s.l = hl & 0xff;
            }
            else {
                s.sp = (s.sp - 1) & 0xffff;
            }
            return mkRes(6, false, false);
        }
        // ADD HL,ss (00 ss 1001)
        if ((op & 0xcf) === 0x09) {
            const ss = (op >>> 4) & 3;
            const hl = ((s.h << 8) | s.l) & 0xffff;
            const ssVal = ss === 0 ? ((s.b << 8) | s.c) & 0xffff : ss === 1 ? ((s.d << 8) | s.e) & 0xffff : ss === 2 ? ((s.h << 8) | s.l) & 0xffff : s.sp;
            const sum = hl + ssVal;
            const r16 = sum & 0xffff;
            // Flags: N=0; H from bit 11; C from carry; preserve S/Z/PV; set F3/F5 from hi byte
            let f = s.f & (FLAG_S | FLAG_Z | FLAG_PV);
            if ((((hl ^ ssVal ^ r16) >>> 12) & 1) !== 0)
                f |= FLAG_H;
            if (sum > 0xffff)
                f |= FLAG_C;
            const hi = (r16 >>> 8) & 0xff;
            if (hi & 0x20)
                f |= FLAG_5;
            if (hi & 0x08)
                f |= FLAG_3;
            s.h = (r16 >>> 8) & 0xff;
            s.l = r16 & 0xff;
            s.f = f;
            return mkRes(11, false, false);
        }
        // LD (nn),HL (00100010)
        if (op === 0x22) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            write16(nn, ((s.h << 8) | s.l) & 0xffff);
            return mkRes(16, false, false);
        }
        // LD HL,(nn) (00101010)
        if (op === 0x2a) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            const val = read16(nn);
            s.h = (val >>> 8) & 0xff;
            s.l = val & 0xff;
            return mkRes(16, false, false);
        }
        // LD (nn),A (00110010)
        if (op === 0x32) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            write8(nn, s.a & 0xff);
            return mkRes(13, false, false);
        }
        // LD A,(nn) (00111010)
        if (op === 0x3a) {
            const lo = fetch8();
            const hi = fetch8();
            const nn = ((hi << 8) | lo) & 0xffff;
            s.a = read8(nn) & 0xff;
            return mkRes(13, false, false);
        }
        // LD (BC),A (00000010)
        if (op === 0x02) {
            const addr = ((s.b << 8) | s.c) & 0xffff;
            write8(addr, s.a & 0xff);
            return mkRes(7, false, false);
        }
        // LD (DE),A (00010010)
        if (op === 0x12) {
            const addr = ((s.d << 8) | s.e) & 0xffff;
            write8(addr, s.a & 0xff);
            return { cycles: 7, irqAccepted: false, nmiAccepted: false };
        }
        // LD A,(BC) (00001010)
        if (op === 0x0a) {
            const addr = ((s.b << 8) | s.c) & 0xffff;
            s.a = read8(addr) & 0xff;
            return { cycles: 7, irqAccepted: false, nmiAccepted: false };
        }
        // LD A,(DE) (00011010)
        if (op === 0x1a) {
            const addr = ((s.d << 8) | s.e) & 0xffff;
            s.a = read8(addr) & 0xff;
            return mkRes(7, false, false);
        }
        // PUSH qq (11 qq 0101) ; POP qq (11 qq 0001)
        if ((op & 0xcf) === 0xc5) {
            const qq = (op >>> 4) & 3;
            let val = 0;
            if (qq === 0)
                val = ((s.b << 8) | s.c) & 0xffff;
            else if (qq === 1)
                val = ((s.d << 8) | s.e) & 0xffff;
            else if (qq === 2)
                val = ((s.h << 8) | s.l) & 0xffff;
            else
                val = ((s.a << 8) | s.f) & 0xffff;
            push16(val);
            return mkRes(11, false, false);
        }
        if ((op & 0xcf) === 0xc1) {
            const qq = (op >>> 4) & 3;
            const val = pop16();
            if (qq === 0) {
                s.b = (val >>> 8) & 0xff;
                s.c = val & 0xff;
            }
            else if (qq === 1) {
                s.d = (val >>> 8) & 0xff;
                s.e = val & 0xff;
            }
            else if (qq === 2) {
                s.h = (val >>> 8) & 0xff;
                s.l = val & 0xff;
            }
            else {
                s.a = (val >>> 8) & 0xff;
                s.f = val & 0xff;
            }
            return mkRes(10, false, false);
        }
        // EX DE,HL (11101011)
        if (op === 0xeb) {
            const td = s.d;
            const te = s.e;
            s.d = s.h;
            s.e = s.l;
            s.h = td;
            s.l = te;
            return mkRes(4, false, false);
        }
        // EX (SP),HL (11100011)
        if (op === 0xe3) {
            const lo = read8(s.sp);
            const hi = read8((s.sp + 1) & 0xffff);
            const hl = ((s.h << 8) | s.l) & 0xffff;
            write8(s.sp, hl & 0xff);
            write8((s.sp + 1) & 0xffff, (hl >>> 8) & 0xff);
            s.h = hi & 0xff;
            s.l = lo & 0xff;
            return mkRes(19, false, false);
        }
        // EX AF,AF' (00001000)
        if (op === 0x08) {
            const ta = s.a;
            const tf = s.f;
            s.a = s.a_ & 0xff;
            s.f = s.f_ & 0xff;
            s.a_ = ta & 0xff;
            s.f_ = tf & 0xff;
            return mkRes(4, false, false);
        }
        // EXX (11011001)
        if (op === 0xd9) {
            let tb = s.b, tc = s.c, td = s.d, te = s.e, th = s.h, tl = s.l;
            s.b = s.b_ & 0xff;
            s.c = s.c_ & 0xff;
            s.d = s.d_ & 0xff;
            s.e = s.e_ & 0xff;
            s.h = s.h_ & 0xff;
            s.l = s.l_ & 0xff;
            s.b_ = tb & 0xff;
            s.c_ = tc & 0xff;
            s.d_ = td & 0xff;
            s.e_ = te & 0xff;
            s.h_ = th & 0xff;
            s.l_ = tl & 0xff;
            return mkRes(4, false, false);
        }
        // LD SP,HL (11111001)
        if (op === 0xf9) {
            s.sp = ((s.h << 8) | s.l) & 0xffff;
            return mkRes(6, false, false);
        }
        // Accumulator short rotates and flag ops
        // RLCA (00000111)
        if (op === 0x07) {
            const c = (s.a >>> 7) & 1;
            s.a = ((s.a << 1) | c) & 0xff;
            let f = s.f & FLAG_C; // preserve C then overwrite below
            f = 0; // S,Z,PV unaffected; N=0,H=0
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            if (c)
                f |= FLAG_C;
            s.f = f;
            return mkRes(4, false, false);
        }
        // RRCA (00001111)
        if (op === 0x0f) {
            const c = s.a & 1;
            s.a = ((s.a >>> 1) | (c << 7)) & 0xff;
            let f = 0;
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            if (c)
                f |= FLAG_C;
            s.f = f;
            return mkRes(4, false, false);
        }
        // RLA (00010111)
        if (op === 0x17) {
            const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
            const c = (s.a >>> 7) & 1;
            s.a = ((s.a << 1) | cPrev) & 0xff;
            let f = 0;
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            if (c)
                f |= FLAG_C;
            s.f = f;
            return mkRes(4, false, false);
        }
        // RRA (00011111)
        if (op === 0x1f) {
            const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
            const c = s.a & 1;
            s.a = ((s.a >>> 1) | (cPrev << 7)) & 0xff;
            let f = 0;
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            if (c)
                f |= FLAG_C;
            s.f = f;
            return { cycles: 4, irqAccepted: false, nmiAccepted: false };
        }
        // CPL (00101111)
        if (op === 0x2f) {
            s.a = (~s.a) & 0xff;
            let f = s.f & (FLAG_S | FLAG_Z | FLAG_PV | FLAG_C);
            f |= FLAG_H | FLAG_N;
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            s.f = f;
            return { cycles: 4, irqAccepted: false, nmiAccepted: false };
        }
        // SCF (00110111)
        if (op === 0x37) {
            let f = s.f & (FLAG_S | FLAG_Z | FLAG_PV);
            f |= FLAG_C; // set carry
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            s.f = f; // H=0,N=0
            return mkRes(4, false, false);
        }
        // CCF (00111111)
        if (op === 0x3f) {
            const cPrev = (s.f & FLAG_C) !== 0 ? 1 : 0;
            let f = s.f & (FLAG_S | FLAG_Z | FLAG_PV);
            if (cPrev === 0)
                f |= FLAG_C;
            if (cPrev)
                f |= FLAG_H; // H becomes previous C
            if (s.a & 0x20)
                f |= FLAG_5;
            if (s.a & 0x08)
                f |= FLAG_3;
            s.f = f; // N=0
            return mkRes(4, false, false);
        }
        // DAA (00100111)
        if (op === 0x27) {
            let a = s.a & 0xff;
            let f = s.f;
            let adjust = 0;
            let carry = (f & FLAG_C) !== 0;
            if ((f & FLAG_N) === 0) {
                if ((f & FLAG_H) !== 0 || (a & 0x0f) > 9)
                    adjust += 0x06;
                if (carry || a > 0x99) {
                    adjust += 0x60;
                    carry = true;
                }
                a = (a + adjust) & 0xff;
            }
            else {
                if ((f & FLAG_H) !== 0)
                    adjust += 0x06;
                if (carry)
                    adjust += 0x60;
                a = (a - adjust) & 0xff;
            }
            s.a = a;
            let nf = setSZ53(a);
            if (parity8(a))
                nf |= FLAG_PV;
            if (carry)
                nf |= FLAG_C;
            if (f & FLAG_N)
                nf |= FLAG_N;
            s.f = nf;
            return mkRes(4, false, false);
        }
        // IN A,(n) (11011011)
        if (op === 0xdb) {
            const port = fetch8();
            const v = readIO8(port);
            s.a = v & 0xff;
            let f = setSZ53(s.a);
            if (parity8(s.a))
                f |= FLAG_PV;
            if (s.f & FLAG_C)
                f |= FLAG_C;
            s.f = f;
            return mkRes(11, false, false);
        }
        // OUT (n),A (11010011)
        if (op === 0xd3) {
            const port = fetch8();
            writeIO8(port, s.a & 0xff);
            return mkRes(11, false, false);
        }
        // INC r (00 rrr 100)
        if ((op & 0xc7) === 0x04) {
            const rCode = (op >>> 3) & 7;
            if (rCode === 6) {
                const addr = getHL();
                const { r, f } = inc8(read8(addr), s.f);
                write8(addr, r);
                s.f = f;
                return mkRes(11, false, false);
            }
            else {
                const { r, f } = inc8(regGet(rCode), s.f);
                regSet(rCode, r);
                s.f = f;
                return mkRes(4, false, false);
            }
        }
        // DEC r (00 rrr 101)
        if ((op & 0xc7) === 0x05) {
            const rCode = (op >>> 3) & 7;
            if (rCode === 6) {
                const addr = getHL();
                const { r, f } = dec8(read8(addr), s.f);
                write8(addr, r);
                s.f = f;
                return mkRes(11, false, false);
            }
            else {
                const { r, f } = dec8(regGet(rCode), s.f);
                regSet(rCode, r);
                s.f = f;
                return mkRes(4, false, false);
            }
        }
        // ADD A, r (10 000 rrr)
        if ((op & 0xf8) === 0x80) {
            const src = op & 7;
            const b = regGet(src);
            const { r, f } = add8(s.a, b, 0);
            s.a = r;
            s.f = f;
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // ADC A, r (10 001 rrr)
        if ((op & 0xf8) === 0x88) {
            const src = op & 7;
            const b = regGet(src);
            const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
            const { r, f } = add8(s.a, b, carry);
            s.a = r;
            s.f = f;
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // SUB r (10 010 rrr)
        if ((op & 0xf8) === 0x90) {
            const src = op & 7;
            const b = regGet(src);
            const { r, f } = sub8(s.a, b, 0);
            s.a = r;
            s.f = f;
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // SBC A, r (10 011 rrr)
        if ((op & 0xf8) === 0x98) {
            const src = op & 7;
            const b = regGet(src);
            const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
            const { r, f } = sub8(s.a, b, carry);
            s.a = r;
            s.f = f;
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // AND r (10 100 rrr)
        if ((op & 0xf8) === 0xa0) {
            const src = op & 7;
            const b = regGet(src);
            const r = s.a & b;
            s.a = r;
            s.f = logicFlags(r, 1);
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // XOR r (10 101 rrr)
        if ((op & 0xf8) === 0xa8) {
            const src = op & 7;
            const b = regGet(src);
            const r = s.a ^ b;
            s.a = r;
            s.f = logicFlags(r, 0);
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // OR r (10 110 rrr)
        if ((op & 0xf8) === 0xb0) {
            const src = op & 7;
            const b = regGet(src);
            const r = s.a | b;
            s.a = r;
            s.f = logicFlags(r, 0);
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // CP r (10 111 rrr)
        if ((op & 0xf8) === 0xb8) {
            const src = op & 7;
            const b = regGet(src);
            const { f } = sub8(s.a, b, 0);
            // A unaffected; flags from result
            s.f = f;
            const hasMem = src === 6;
            return mkRes(hasMem ? 7 : 4, false, false);
        }
        // ADD A, n (11000110)
        if (op === 0xc6) {
            const imm = fetch8();
            const { r, f } = add8(s.a, imm, 0);
            s.a = r;
            s.f = f;
            return mkRes(7, false, false);
        }
        // ADC A, n (11001110)
        if (op === 0xce) {
            const imm = fetch8();
            const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
            const { r, f } = add8(s.a, imm, carry);
            s.a = r;
            s.f = f;
            return mkRes(7, false, false);
        }
        // SUB n (11010110)
        if (op === 0xd6) {
            const imm = fetch8();
            const { r, f } = sub8(s.a, imm, 0);
            s.a = r;
            s.f = f;
            return mkRes(7, false, false);
        }
        // SBC A, n (11011110)
        if (op === 0xde) {
            const imm = fetch8();
            const carry = (s.f & FLAG_C) !== 0 ? 1 : 0;
            const { r, f } = sub8(s.a, imm, carry);
            s.a = r;
            s.f = f;
            return mkRes(7, false, false);
        }
        // AND n (11100110)
        if (op === 0xe6) {
            const imm = fetch8();
            const r = s.a & imm;
            s.a = r;
            s.f = logicFlags(r, 1);
            return mkRes(7, false, false);
        }
        // XOR n (11101110)
        if (op === 0xee) {
            const imm = fetch8();
            const r = s.a ^ imm;
            s.a = r;
            s.f = logicFlags(r, 0);
            return mkRes(7, false, false);
        }
        // OR n (11110110)
        if (op === 0xf6) {
            const imm = fetch8();
            const r = s.a | imm;
            s.a = r;
            s.f = logicFlags(r, 0);
            return mkRes(7, false, false);
        }
        // CP n (11111110)
        if (op === 0xfe) {
            const imm = fetch8();
            const { f } = sub8(s.a, imm, 0);
            s.f = f;
            // Commit EI pending if any
            if (iff1Pending) {
                s.iff1 = true;
                s.iff2 = true;
                iff1Pending = false;
            }
            return mkRes(7, false, false);
        }
        // DI (11110011)
        if (op === 0xf3) {
            s.iff1 = false;
            s.iff2 = false;
            iff1Pending = false;
            return mkRes(4, false, false);
        }
        // EI (11111011)
        if (op === 0xfb) {
            // interrupts become enabled after next instruction
            iff1Pending = true;
            return mkRes(4, false, false);
        }
        // Unimplemented opcode
        throw new Error(`Unimplemented opcode 0x${op.toString(16).padStart(2, '0')} at PC=0x${(s.pc - 1)
            .toString(16)
            .padStart(4, '0')}`);
    };
    const reset = () => {
        s = createResetState();
        pendingIRQ = false;
        pendingNMI = false;
        iff1Pending = false;
    };
    const getState = () => ({ ...s });
    const setState = (st) => {
        s = { ...st };
    };
    const requestIRQ = () => {
        pendingIRQ = true;
    };
    const requestNMI = () => {
        pendingNMI = true;
    };
    const setIM2Vector = (v) => {
        im2Vector = v & 0xff;
    };
    const setIM0Vector = (addr) => {
        im0Vector = addr & 0xffff;
    };
    const setIM0Opcode = (op) => {
        if (op === null)
            im0Opcode = null;
        else
            im0Opcode = op & 0xff;
    };
    const resetInterruptConfig = () => {
        im0Opcode = null;
        im0Vector = 0x0038;
        im2Vector = 0xff;
    };
    return {
        reset,
        stepOne,
        getState,
        setState,
        requestIRQ,
        requestNMI,
        setIM2Vector,
        setIM0Vector,
        setIM0Opcode,
        resetInterruptConfig,
        setWaitStateHooks: (cfg) => {
            ws = cfg ?? null;
        },
        getLastWaitCycles: () => lastWaitCycles | 0,
    };
};
