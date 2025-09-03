const rNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const ccJR = ['NZ', 'Z', 'NC', 'C'];
const ccJP = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ddNames = ['BC', 'DE', 'HL', 'SP'];
const qqNames = ['BC', 'DE', 'HL', 'AF'];
const hex2 = (v) => v.toString(16).padStart(2, '0').toUpperCase();
const hex4 = (v) => v.toString(16).padStart(4, '0').toUpperCase();
const rd = (read8, a) => read8(a) & 0xff;
export const disassembleOne = (read8, pc) => {
    const op = rd(read8, pc);
    // Prefixes
    if (op === 0xED) {
        const sub = rd(read8, (pc + 1) & 0xffff);
        // IM 0/1/2
        if (sub === 0x46 || sub === 0x66 || sub === 0x76) {
            return { length: 2, bytes: [op, sub], text: 'IM 0' };
        }
        if (sub === 0x56)
            return { length: 2, bytes: [op, sub], text: 'IM 1' };
        if (sub === 0x5E)
            return { length: 2, bytes: [op, sub], text: 'IM 2' };
        // LD (nn),ss and LD ss,(nn)
        if ((sub & 0xCF) === 0x43) {
            const lo = rd(read8, (pc + 2) & 0xffff);
            const hi = rd(read8, (pc + 3) & 0xffff);
            const nn = ((hi << 8) | lo) & 0xffff;
            const sel = (sub >>> 4) & 3;
            const ss = ddNames[sel];
            return { length: 4, bytes: [op, sub, lo, hi], text: `LD (${hex4(nn)}),${ss}` };
        }
        if ((sub & 0xCF) === 0x4B) {
            const lo = rd(read8, (pc + 2) & 0xffff);
            const hi = rd(read8, (pc + 3) & 0xffff);
            const nn = ((hi << 8) | lo) & 0xffff;
            const sel = (sub >>> 4) & 3;
            const ss = ddNames[sel];
            return { length: 4, bytes: [op, sub, lo, hi], text: `LD ${ss},(${hex4(nn)})` };
        }
        // LDI/LDD/LDIR/LDDR
        if (sub === 0xA0)
            return { length: 2, bytes: [op, sub], text: 'LDI' };
        if (sub === 0xA8)
            return { length: 2, bytes: [op, sub], text: 'LDD' };
        if (sub === 0xB0)
            return { length: 2, bytes: [op, sub], text: 'LDIR' };
        if (sub === 0xB8)
            return { length: 2, bytes: [op, sub], text: 'LDDR' };
        // CPI/CPD/CPIR/CPDR
        if (sub === 0xA1)
            return { length: 2, bytes: [op, sub], text: 'CPI' };
        if (sub === 0xA9)
            return { length: 2, bytes: [op, sub], text: 'CPD' };
        if (sub === 0xB1)
            return { length: 2, bytes: [op, sub], text: 'CPIR' };
        if (sub === 0xB9)
            return { length: 2, bytes: [op, sub], text: 'CPDR' };
        // LD A,I / LD A,R / LD I,A / LD R,A
        if (sub === 0x57)
            return { length: 2, bytes: [op, sub], text: 'LD A,I' };
        if (sub === 0x5F)
            return { length: 2, bytes: [op, sub], text: 'LD A,R' };
        if (sub === 0x47)
            return { length: 2, bytes: [op, sub], text: 'LD I,A' };
        if (sub === 0x4F)
            return { length: 2, bytes: [op, sub], text: 'LD R,A' };
        // RETN / RETI
        if (sub === 0x45)
            return { length: 2, bytes: [op, sub], text: 'RETN' };
        if (sub === 0x4D)
            return { length: 2, bytes: [op, sub], text: 'RETI' };
        // IN r,(C)
        if ((sub & 0xC7) === 0x40) {
            const r = (sub >>> 3) & 7;
            const rS = r === 6 ? '(C)' : rNames[r];
            return { length: 2, bytes: [op, sub], text: `IN ${rS},(C)` };
        }
        // OUT (C),r
        if ((sub & 0xC7) === 0x41) {
            const r = (sub >>> 3) & 7;
            const rS = r === 6 ? '0' : rNames[r];
            return { length: 2, bytes: [op, sub], text: `OUT (C),${rS}` };
        }
        // ADC/SBC HL,ss
        if ((sub & 0xCF) === 0x4A) {
            const sel = (sub >>> 4) & 3;
            const ss = ddNames[sel];
            return { length: 2, bytes: [op, sub], text: `ADC HL,${ss}` };
        }
        if ((sub & 0xCF) === 0x42) {
            const sel = (sub >>> 4) & 3;
            const ss = ddNames[sel];
            return { length: 2, bytes: [op, sub], text: `SBC HL,${ss}` };
        }
        // RRD / RLD
        if (sub === 0x67)
            return { length: 2, bytes: [op, sub], text: 'RRD' };
        if (sub === 0x6F)
            return { length: 2, bytes: [op, sub], text: 'RLD' };
        // Fallback ED
        return { length: 2, bytes: [op, sub], text: `ED ${hex2(sub)}` };
    }
    if (op === 0xDD || op === 0xFD) {
        const isIX = op === 0xDD;
        const ixName = isIX ? 'IX' : 'IY';
        const op2 = rd(read8, (pc + 1) & 0xffff);
        if (op2 === 0x21) {
            const lo = rd(read8, (pc + 2) & 0xffff);
            const hi = rd(read8, (pc + 3) & 0xffff);
            const nn = ((hi << 8) | lo) & 0xffff;
            return { length: 4, bytes: [op, op2, lo, hi], text: `LD ${ixName},${hex4(nn)}` };
        }
        if (op2 === 0x36) {
            const d = rd(read8, (pc + 2) & 0xffff);
            const n = rd(read8, (pc + 3) & 0xffff);
            return { length: 4, bytes: [op, op2, d, n], text: `LD (${ixName}+${(d << 24) >> 24}),${hex2(n)}` };
        }
        if (op2 === 0x34) {
            const d = rd(read8, (pc + 2) & 0xffff);
            return { length: 3, bytes: [op, op2, d], text: `INC (${ixName}+${(d << 24) >> 24})` };
        }
        if (op2 === 0x35) {
            const d = rd(read8, (pc + 2) & 0xffff);
            return { length: 3, bytes: [op, op2, d], text: `DEC (${ixName}+${(d << 24) >> 24})` };
        }
        if (op2 === 0xE9) {
            return { length: 2, bytes: [op, op2], text: `JP (${ixName})` };
        }
        if (op2 === 0xCB) {
            const d = rd(read8, (pc + 2) & 0xffff);
            const sub = rd(read8, (pc + 3) & 0xffff);
            const group = sub & 0xC0;
            const y = (sub >>> 3) & 7;
            const r = sub & 7;
            const dStr = (d << 24) >> 24; // sign
            if (group === 0x40) {
                return { length: 4, bytes: [op, op2, d, sub], text: `BIT ${y},(${ixName}+${dStr})` };
            }
            if (group === 0x80) {
                return { length: 4, bytes: [op, op2, d, sub], text: `RES ${y},(${ixName}+${dStr})${r !== 6 ? ',' + rNames[r] : ''}` };
            }
            if (group === 0xC0) {
                return { length: 4, bytes: [op, op2, d, sub], text: `SET ${y},(${ixName}+${dStr})${r !== 6 ? ',' + rNames[r] : ''}` };
            }
            // Rotates/shifts
            const rotNames = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
            return { length: 4, bytes: [op, op2, d, sub], text: `${rotNames[y]} (${ixName}+${dStr})${r !== 6 ? ',' + rNames[r] : ''}` };
        }
        // LD r,(IX+d) or LD (IX+d),r via matrix when one side is (HL)
        if ((op2 & 0xC0) === 0x40) {
            const rDst = (op2 >>> 3) & 7;
            const rSrc = op2 & 7;
            if (rDst === 6 || rSrc === 6) {
                const d = rd(read8, (pc + 2) & 0xffff);
                const dStr = (d << 24) >> 24;
                if (rSrc === 6)
                    return { length: 3, bytes: [op, op2, d], text: `LD ${rNames[rDst]},(${ixName}+${dStr})` };
                return { length: 3, bytes: [op, op2, d], text: `LD (${ixName}+${dStr}),${rNames[rSrc]}` };
            }
            // Pure register transfer under DD/FD: behaves like normal LD r,r'
            return { length: 2, bytes: [op, op2], text: `LD ${rNames[rDst]},${rNames[rSrc]}` };
        }
        // Fallback for DD/FD
        return { length: 2, bytes: [op, op2], text: `${isIX ? 'DD' : 'FD'} ${hex2(op2)}` };
    }
    // Base opcodes
    if (op === 0x00)
        return { length: 1, bytes: [op], text: 'NOP' };
    if (op === 0x76)
        return { length: 1, bytes: [op], text: 'HALT' };
    if (op === 0xFB)
        return { length: 1, bytes: [op], text: 'EI' };
    if (op === 0xF3)
        return { length: 1, bytes: [op], text: 'DI' };
    if (op === 0xDB) {
        const n = rd(read8, (pc + 1) & 0xffff);
        return { length: 2, bytes: [op, n], text: `IN A,(${hex2(n)})` };
    }
    if (op === 0xD3) {
        const n = rd(read8, (pc + 1) & 0xffff);
        return { length: 2, bytes: [op, n], text: `OUT (${hex2(n)}),A` };
    }
    if (op === 0xC3) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        return { length: 3, bytes: [op, lo, hi], text: `JP ${hex4(nn)}` };
    }
    if (op === 0x18) {
        const d = rd(read8, (pc + 1) & 0xffff);
        const s = (d << 24) >> 24;
        return { length: 2, bytes: [op, d], text: `JR ${s}` };
    }
    if (op === 0x10) {
        const d = rd(read8, (pc + 1) & 0xffff);
        const s = (d << 24) >> 24;
        return { length: 2, bytes: [op, d], text: `DJNZ ${s}` };
    }
    if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
        const d = rd(read8, (pc + 1) & 0xffff);
        const s = (d << 24) >> 24;
        const cond = ccJR[(op >>> 3) & 3];
        return { length: 2, bytes: [op, d], text: `JR ${cond},${s}` };
    }
    if ((op & 0xC7) === 0x06) {
        const r = (op >>> 3) & 7;
        const n = rd(read8, (pc + 1) & 0xffff);
        if (r === 6)
            return { length: 2, bytes: [op, n], text: `LD (HL),${hex2(n)}` };
        return { length: 2, bytes: [op, n], text: `LD ${rNames[r]},${hex2(n)}` };
    }
    if ((op & 0xC0) === 0x40) {
        const rDst = (op >>> 3) & 7;
        const rSrc = op & 7;
        if (op === 0x76)
            return { length: 1, bytes: [op], text: 'HALT' };
        return { length: 1, bytes: [op], text: `LD ${rNames[rDst]},${rNames[rSrc]}` };
    }
    if (op === 0xCD) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        return { length: 3, bytes: [op, lo, hi], text: `CALL ${hex4(nn)}` };
    }
    if (op === 0xC9) {
        return { length: 1, bytes: [op], text: 'RET' };
    }
    if ((op & 0xC7) === 0xC7) {
        const tgt = op & 0x38;
        return { length: 1, bytes: [op], text: `RST ${hex2(tgt)}` };
    }
    // LD (nn),A
    if (op === 0x32) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        return { length: 3, bytes: [op, lo, hi], text: `LD (${hex4(nn)}),A` };
    }
    // LD A,(nn)
    if (op === 0x3A) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        return { length: 3, bytes: [op, lo, hi], text: `LD A,(${hex4(nn)})` };
    }
    // LD HL,(nn)
    if (op === 0x2A) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        return { length: 3, bytes: [op, lo, hi], text: `LD HL,(${hex4(nn)})` };
    }
    // LD (nn),HL
    if (op === 0x22) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        return { length: 3, bytes: [op, lo, hi], text: `LD (${hex4(nn)}),HL` };
    }
    // LD SP,HL
    if (op === 0xF9) {
        return { length: 1, bytes: [op], text: `LD SP,HL` };
    }
    // LD dd,nn (BC, DE, HL, SP)
    if (op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) {
        const lo = rd(read8, (pc + 1) & 0xffff);
        const hi = rd(read8, (pc + 2) & 0xffff);
        const nn = ((hi << 8) | lo) & 0xffff;
        const dd = ddNames[(op >>> 4) & 3];
        return { length: 3, bytes: [op, lo, hi], text: `LD ${dd},${hex4(nn)}` };
    }
    // INC dd (00 dd 0011)
    if ((op & 0xCF) === 0x03) {
        const dd = ddNames[(op >>> 4) & 3];
        return { length: 1, bytes: [op], text: `INC ${dd}` };
    }
    // DEC dd (00 dd 1011)
    if ((op & 0xCF) === 0x0B) {
        const dd = ddNames[(op >>> 4) & 3];
        return { length: 1, bytes: [op], text: `DEC ${dd}` };
    }
    // INC r (00 rrr 100)
    if ((op & 0xC7) === 0x04) {
        const r = (op >>> 3) & 7;
        return { length: 1, bytes: [op], text: `INC ${rNames[r]}` };
    }
    // DEC r (00 rrr 101)
    if ((op & 0xC7) === 0x05) {
        const r = (op >>> 3) & 7;
        return { length: 1, bytes: [op], text: `DEC ${rNames[r]}` };
    }
    // ADD HL,ss
    if ((op & 0xCF) === 0x09) {
        const ss = ddNames[(op >>> 4) & 3];
        return { length: 1, bytes: [op], text: `ADD HL,${ss}` };
    }
    // PUSH qq
    if ((op & 0xCF) === 0xC5) {
        const qq = qqNames[(op >>> 4) & 3];
        return { length: 1, bytes: [op], text: `PUSH ${qq}` };
    }
    // POP qq
    if ((op & 0xCF) === 0xC1) {
        const qq = qqNames[(op >>> 4) & 3];
        return { length: 1, bytes: [op], text: `POP ${qq}` };
    }
    // Arithmetic and logic instructions
    // ADD A,r
    if ((op & 0xF8) === 0x80) {
        const r = op & 7;
        return { length: 1, bytes: [op], text: `ADD A,${rNames[r]}` };
    }
    // ADC A,r  
    if ((op & 0xF8) === 0x88) {
        const r = op & 7;
        return { length: 1, bytes: [op], text: `ADC A,${rNames[r]}` };
    }
    // SUB r
    if ((op & 0xF8) === 0x90) {
        const r = op & 7;
        return { length: 1, bytes: [op], text: `SUB ${rNames[r]}` };
    }
    // SBC A,r
    if ((op & 0xF8) === 0x98) {
        const r = op & 7;
        return { length: 1, bytes: [op], text: `SBC A,${rNames[r]}` };
    }
    // AND r
    if ((op & 0xF8) === 0xA0) {
        const r = op & 7;
        return { length: 1, bytes: [op], text: `AND ${rNames[r]}` };
    }
    // XOR r
    if ((op & 0xF8) === 0xA8) {
        const r = op & 7;
        if (r === 7 && op === 0xAF)
            return { length: 1, bytes: [op], text: 'XOR A' };
        return { length: 1, bytes: [op], text: `XOR ${rNames[r]}` };
    }
    // OR r
    if ((op & 0xF8) === 0xB0) {
        const r = op & 7;
        if (r === 7 && op === 0xB7)
            return { length: 1, bytes: [op], text: 'OR A' };
        return { length: 1, bytes: [op], text: `OR ${rNames[r]}` };
    }
    // CP r
    if ((op & 0xF8) === 0xB8) {
        const r = op & 7;
        return { length: 1, bytes: [op], text: `CP ${rNames[r]}` };
    }
    // Exchange instructions
    if (op === 0x08)
        return { length: 1, bytes: [op], text: 'EX AF,AF\'' };
    if (op === 0xD9)
        return { length: 1, bytes: [op], text: 'EXX' };
    if (op === 0xEB)
        return { length: 1, bytes: [op], text: 'EX DE,HL' };
    if (op === 0xE3)
        return { length: 1, bytes: [op], text: 'EX (SP),HL' };
    // Fallback base
    return { length: 1, bytes: [op], text: `DB ${hex2(op)}` };
};
export const disassembleRange = (bus, start, count) => {
    const out = [];
    let pc = start & 0xffff;
    const readFn = (addr) => bus.read8(addr & 0xffff) & 0xff;
    for (let i = 0; i < count; i++) {
        const r = disassembleOne(readFn, pc);
        out.push(r);
        pc = (pc + r.length) & 0xffff;
    }
    return out;
};
//# sourceMappingURL=disasm.js.map