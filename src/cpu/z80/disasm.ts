import type { IBus } from '../../bus/bus.js';

export interface DisasmResult {
  length: number;
  bytes: number[];
  text: string;
}

const rNames: readonly string[] = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'] as const;
const ccJR: readonly string[] = ['NZ', 'Z', 'NC', 'C'] as const;
const ccJP: readonly string[] = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'] as const;
const ddNames: readonly string[] = ['BC', 'DE', 'HL', 'SP'] as const;
const qqNames: readonly string[] = ['BC', 'DE', 'HL', 'AF'] as const;

const hex2 = (v: number): string => v.toString(16).padStart(2, '0').toUpperCase();
const hex4 = (v: number): string => v.toString(16).padStart(4, '0').toUpperCase();

const rd = (read8: (addr: number) => number, a: number): number => read8(a) & 0xff;

export const disassembleOne = (read8: (addr: number) => number, pc: number): DisasmResult => {
  const op = rd(read8, pc);

  // Prefixes
  if (op === 0xed) {
    const sub = rd(read8, (pc + 1) & 0xffff);
    // IM 0/1/2
    if (sub === 0x46 || sub === 0x66 || sub === 0x76) {
      return { length: 2, bytes: [op, sub], text: 'IM 0' };
    }
    if (sub === 0x56) return { length: 2, bytes: [op, sub], text: 'IM 1' };
    if (sub === 0x5e) return { length: 2, bytes: [op, sub], text: 'IM 2' };
    // LD (nn),ss and LD ss,(nn)
    if ((sub & 0xcf) === 0x43) {
      const lo = rd(read8, (pc + 2) & 0xffff);
      const hi = rd(read8, (pc + 3) & 0xffff);
      const nn = ((hi << 8) | lo) & 0xffff;
      const sel = (sub >>> 4) & 3;
      const ss = ddNames[sel]!;
      return { length: 4, bytes: [op, sub, lo, hi], text: `LD (${hex4(nn)}),${ss}` };
    }
    if ((sub & 0xcf) === 0x4b) {
      const lo = rd(read8, (pc + 2) & 0xffff);
      const hi = rd(read8, (pc + 3) & 0xffff);
      const nn = ((hi << 8) | lo) & 0xffff;
      const sel = (sub >>> 4) & 3;
      const ss = ddNames[sel]!;
      return { length: 4, bytes: [op, sub, lo, hi], text: `LD ${ss},(${hex4(nn)})` };
    }
    // LDI/LDD/LDIR/LDDR
    if (sub === 0xa0) return { length: 2, bytes: [op, sub], text: 'LDI' };
    if (sub === 0xa8) return { length: 2, bytes: [op, sub], text: 'LDD' };
    if (sub === 0xb0) return { length: 2, bytes: [op, sub], text: 'LDIR' };
    if (sub === 0xb8) return { length: 2, bytes: [op, sub], text: 'LDDR' };
    // CPI/CPD/CPIR/CPDR
    if (sub === 0xa1) return { length: 2, bytes: [op, sub], text: 'CPI' };
    if (sub === 0xa9) return { length: 2, bytes: [op, sub], text: 'CPD' };
    if (sub === 0xb1) return { length: 2, bytes: [op, sub], text: 'CPIR' };
    if (sub === 0xb9) return { length: 2, bytes: [op, sub], text: 'CPDR' };
    // LD A,I / LD A,R / LD I,A / LD R,A
    if (sub === 0x57) return { length: 2, bytes: [op, sub], text: 'LD A,I' };
    if (sub === 0x5f) return { length: 2, bytes: [op, sub], text: 'LD A,R' };
    if (sub === 0x47) return { length: 2, bytes: [op, sub], text: 'LD I,A' };
    if (sub === 0x4f) return { length: 2, bytes: [op, sub], text: 'LD R,A' };
    // RETN / RETI
    if (sub === 0x45) return { length: 2, bytes: [op, sub], text: 'RETN' };
    if (sub === 0x4d) return { length: 2, bytes: [op, sub], text: 'RETI' };
    // IN r,(C)
    if ((sub & 0xc7) === 0x40) {
      const r = (sub >>> 3) & 7;
      const rS = r === 6 ? '(C)' : rNames[r]!;
      return { length: 2, bytes: [op, sub], text: `IN ${rS},(C)` };
    }
    // OUT (C),r
    if ((sub & 0xc7) === 0x41) {
      const r = (sub >>> 3) & 7;
      const rS = r === 6 ? '0' : rNames[r]!;
      return { length: 2, bytes: [op, sub], text: `OUT (C),${rS}` };
    }
    // ADC/SBC HL,ss
    if ((sub & 0xcf) === 0x4a) {
      const sel = (sub >>> 4) & 3;
      const ss = ddNames[sel]!;
      return { length: 2, bytes: [op, sub], text: `ADC HL,${ss}` };
    }
    if ((sub & 0xcf) === 0x42) {
      const sel = (sub >>> 4) & 3;
      const ss = ddNames[sel]!;
      return { length: 2, bytes: [op, sub], text: `SBC HL,${ss}` };
    }
    // RRD / RLD
    if (sub === 0x67) return { length: 2, bytes: [op, sub], text: 'RRD' };
    if (sub === 0x6f) return { length: 2, bytes: [op, sub], text: 'RLD' };
    // Fallback ED
    return { length: 2, bytes: [op, sub], text: `ED ${hex2(sub)}` };
  }

  if (op === 0xdd || op === 0xfd) {
    const isIX = op === 0xdd;
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
    if (op2 === 0xe9) {
      return { length: 2, bytes: [op, op2], text: `JP (${ixName})` };
    }
    if (op2 === 0xcb) {
      const d = rd(read8, (pc + 2) & 0xffff);
      const sub = rd(read8, (pc + 3) & 0xffff);
      const group = sub & 0xc0;
      const y = (sub >>> 3) & 7;
      const r = sub & 7;
      const dStr = (d << 24) >> 24; // sign
      if (group === 0x40) {
        return { length: 4, bytes: [op, op2, d, sub], text: `BIT ${y},(${ixName}+${dStr})` };
      }
      if (group === 0x80) {
        return {
          length: 4,
          bytes: [op, op2, d, sub],
          text: `RES ${y},(${ixName}+${dStr})${r !== 6 ? ',' + rNames[r]! : ''}`,
        };
      }
      if (group === 0xc0) {
        return {
          length: 4,
          bytes: [op, op2, d, sub],
          text: `SET ${y},(${ixName}+${dStr})${r !== 6 ? ',' + rNames[r]! : ''}`,
        };
      }
      // Rotates/shifts
      const rotNames: readonly string[] = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'] as const;
      return {
        length: 4,
        bytes: [op, op2, d, sub],
        text: `${rotNames[y]!} (${ixName}+${dStr})${r !== 6 ? ',' + rNames[r]! : ''}`,
      };
    }
    // LD r,(IX+d) or LD (IX+d),r via matrix when one side is (HL)
    if ((op2 & 0xc0) === 0x40) {
      const rDst = (op2 >>> 3) & 7;
      const rSrc = op2 & 7;
      if (rDst === 6 || rSrc === 6) {
        const d = rd(read8, (pc + 2) & 0xffff);
        const dStr = (d << 24) >> 24;
        if (rSrc === 6) return { length: 3, bytes: [op, op2, d], text: `LD ${rNames[rDst]!},(${ixName}+${dStr})` };
        return { length: 3, bytes: [op, op2, d], text: `LD (${ixName}+${dStr}),${rNames[rSrc]!}` };
      }
      // Pure register transfer under DD/FD: behaves like normal LD r,r'
      return { length: 2, bytes: [op, op2], text: `LD ${rNames[rDst]!},${rNames[rSrc]!}` };
    }
    // Fallback for DD/FD
    return { length: 2, bytes: [op, op2], text: `${isIX ? 'DD' : 'FD'} ${hex2(op2)}` };
  }

  // Base opcodes
  if (op === 0x00) return { length: 1, bytes: [op], text: 'NOP' };
  if (op === 0x76) return { length: 1, bytes: [op], text: 'HALT' };
  if (op === 0xfb) return { length: 1, bytes: [op], text: 'EI' };
  if (op === 0xf3) return { length: 1, bytes: [op], text: 'DI' };

  // Accumulator rotate instructions
  if (op === 0x07) return { length: 1, bytes: [op], text: 'RLCA' };
  if (op === 0x0f) return { length: 1, bytes: [op], text: 'RRCA' };
  if (op === 0x17) return { length: 1, bytes: [op], text: 'RLA' };
  if (op === 0x1f) return { length: 1, bytes: [op], text: 'RRA' };

  if (op === 0xdb) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `IN A,(${hex2(n)})` };
  }
  if (op === 0xd3) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `OUT (${hex2(n)}),A` };
  }

  if (op === 0xc3) {
    const lo = rd(read8, (pc + 1) & 0xffff);
    const hi = rd(read8, (pc + 2) & 0xffff);
    const nn = ((hi << 8) | lo) & 0xffff;
    return { length: 3, bytes: [op, lo, hi], text: `JP ${hex4(nn)}` };
  }

  // Conditional jump instructions
  if ((op & 0xc7) === 0xc2) {
    const lo = rd(read8, (pc + 1) & 0xffff);
    const hi = rd(read8, (pc + 2) & 0xffff);
    const nn = ((hi << 8) | lo) & 0xffff;
    const cc = (op >>> 3) & 7;
    const cond = ccJP[cc]!;
    return { length: 3, bytes: [op, lo, hi], text: `JP ${cond},${hex4(nn)}` };
  }

  // JP (HL) (0xE9)
  if (op === 0xe9) {
    return { length: 1, bytes: [op], text: 'JP (HL)' };
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
    const cond = ccJR[(op >>> 3) & 3]!;
    return { length: 2, bytes: [op, d], text: `JR ${cond},${s}` };
  }

  if ((op & 0xc7) === 0x06) {
    const r = (op >>> 3) & 7;
    const n = rd(read8, (pc + 1) & 0xffff);
    if (r === 6) return { length: 2, bytes: [op, n], text: `LD (HL),${hex2(n)}` };
    return { length: 2, bytes: [op, n], text: `LD ${rNames[r]!},${hex2(n)}` };
  }

  if ((op & 0xc0) === 0x40) {
    const rDst = (op >>> 3) & 7;
    const rSrc = op & 7;
    if (op === 0x76) return { length: 1, bytes: [op], text: 'HALT' };
    return { length: 1, bytes: [op], text: `LD ${rNames[rDst]!},${rNames[rSrc]!}` };
  }

  if (op === 0xcd) {
    const lo = rd(read8, (pc + 1) & 0xffff);
    const hi = rd(read8, (pc + 2) & 0xffff);
    const nn = ((hi << 8) | lo) & 0xffff;
    return { length: 3, bytes: [op, lo, hi], text: `CALL ${hex4(nn)}` };
  }
  if (op === 0xc9) {
    return { length: 1, bytes: [op], text: 'RET' };
  }
  if ((op & 0xc7) === 0xc7) {
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
  if (op === 0x3a) {
    const lo = rd(read8, (pc + 1) & 0xffff);
    const hi = rd(read8, (pc + 2) & 0xffff);
    const nn = ((hi << 8) | lo) & 0xffff;
    return { length: 3, bytes: [op, lo, hi], text: `LD A,(${hex4(nn)})` };
  }

  // LD HL,(nn)
  if (op === 0x2a) {
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
  if (op === 0xf9) {
    return { length: 1, bytes: [op], text: `LD SP,HL` };
  }

  // LD dd,nn (BC, DE, HL, SP)
  if (op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) {
    const lo = rd(read8, (pc + 1) & 0xffff);
    const hi = rd(read8, (pc + 2) & 0xffff);
    const nn = ((hi << 8) | lo) & 0xffff;
    const dd = ddNames[(op >>> 4) & 3]!;
    return { length: 3, bytes: [op, lo, hi], text: `LD ${dd},${hex4(nn)}` };
  }

  // INC dd (00 dd 0011)
  if ((op & 0xcf) === 0x03) {
    const dd = ddNames[(op >>> 4) & 3]!;
    return { length: 1, bytes: [op], text: `INC ${dd}` };
  }

  // DEC dd (00 dd 1011)
  if ((op & 0xcf) === 0x0b) {
    const dd = ddNames[(op >>> 4) & 3]!;
    return { length: 1, bytes: [op], text: `DEC ${dd}` };
  }

  // INC r (00 rrr 100)
  if ((op & 0xc7) === 0x04) {
    const r = (op >>> 3) & 7;
    return { length: 1, bytes: [op], text: `INC ${rNames[r]!}` };
  }

  // DEC r (00 rrr 101)
  if ((op & 0xc7) === 0x05) {
    const r = (op >>> 3) & 7;
    return { length: 1, bytes: [op], text: `DEC ${rNames[r]!}` };
  }

  // ADD HL,ss
  if ((op & 0xcf) === 0x09) {
    const ss = ddNames[(op >>> 4) & 3]!;
    return { length: 1, bytes: [op], text: `ADD HL,${ss}` };
  }

  // PUSH qq
  if ((op & 0xcf) === 0xc5) {
    const qq = qqNames[(op >>> 4) & 3]!;
    return { length: 1, bytes: [op], text: `PUSH ${qq}` };
  }

  // POP qq
  if ((op & 0xcf) === 0xc1) {
    const qq = qqNames[(op >>> 4) & 3]!;
    return { length: 1, bytes: [op], text: `POP ${qq}` };
  }

  // Arithmetic and logic instructions
  // ADD A,r
  if ((op & 0xf8) === 0x80) {
    const r = op & 7;
    return { length: 1, bytes: [op], text: `ADD A,${rNames[r]!}` };
  }
  // ADC A,r
  if ((op & 0xf8) === 0x88) {
    const r = op & 7;
    return { length: 1, bytes: [op], text: `ADC A,${rNames[r]!}` };
  }
  // SUB r
  if ((op & 0xf8) === 0x90) {
    const r = op & 7;
    return { length: 1, bytes: [op], text: `SUB ${rNames[r]!}` };
  }
  // SBC A,r
  if ((op & 0xf8) === 0x98) {
    const r = op & 7;
    return { length: 1, bytes: [op], text: `SBC A,${rNames[r]!}` };
  }
  // AND r
  if ((op & 0xf8) === 0xa0) {
    const r = op & 7;
    return { length: 1, bytes: [op], text: `AND ${rNames[r]!}` };
  }
  // XOR r
  if ((op & 0xf8) === 0xa8) {
    const r = op & 7;
    if (r === 7 && op === 0xaf) return { length: 1, bytes: [op], text: 'XOR A' };
    return { length: 1, bytes: [op], text: `XOR ${rNames[r]!}` };
  }
  // OR r
  if ((op & 0xf8) === 0xb0) {
    const r = op & 7;
    if (r === 7 && op === 0xb7) return { length: 1, bytes: [op], text: 'OR A' };
    return { length: 1, bytes: [op], text: `OR ${rNames[r]!}` };
  }
  // CP r
  if ((op & 0xf8) === 0xb8) {
    const r = op & 7;
    return { length: 1, bytes: [op], text: `CP ${rNames[r]!}` };
  }

  // Exchange instructions
  if (op === 0x08) return { length: 1, bytes: [op], text: "EX AF,AF'" };
  if (op === 0xd9) return { length: 1, bytes: [op], text: 'EXX' };
  if (op === 0xeb) return { length: 1, bytes: [op], text: 'EX DE,HL' };
  if (op === 0xe3) return { length: 1, bytes: [op], text: 'EX (SP),HL' };

  // Immediate arithmetic/logic instructions
  if (op === 0xc6) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `ADD A,${hex2(n)}` };
  }
  if (op === 0xce) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `ADC A,${hex2(n)}` };
  }
  if (op === 0xd6) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `SUB ${hex2(n)}` };
  }
  if (op === 0xde) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `SBC A,${hex2(n)}` };
  }
  if (op === 0xe6) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `AND ${hex2(n)}` };
  }
  if (op === 0xee) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `XOR ${hex2(n)}` };
  }
  if (op === 0xf6) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `OR ${hex2(n)}` };
  }
  if (op === 0xfe) {
    const n = rd(read8, (pc + 1) & 0xffff);
    return { length: 2, bytes: [op, n], text: `CP ${hex2(n)}` };
  }

  // CB prefix instructions (bit manipulation)
  if (op === 0xcb) {
    const sub = rd(read8, (pc + 1) & 0xffff);
    const group = sub & 0xc0;
    const y = (sub >>> 3) & 7;
    const r = sub & 7;
    
    if (group === 0x40) {
      return { length: 2, bytes: [op, sub], text: `BIT ${y},${rNames[r]!}` };
    }
    if (group === 0x80) {
      return { length: 2, bytes: [op, sub], text: `RES ${y},${rNames[r]!}` };
    }
    if (group === 0xc0) {
      return { length: 2, bytes: [op, sub], text: `SET ${y},${rNames[r]!}` };
    }
    
    // Rotates/shifts
    const rotNames: readonly string[] = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'] as const;
    return { length: 2, bytes: [op, sub], text: `${rotNames[y]!} ${rNames[r]!}` };
  }

  // Fallback base
  return { length: 1, bytes: [op], text: `DB ${hex2(op)}` };
};

export const disassembleRange = (bus: IBus, start: number, count: number): DisasmResult[] => {
  const out: DisasmResult[] = [];
  let pc = start & 0xffff;
  const readFn = (addr: number): number => bus.read8(addr & 0xffff) & 0xff;
  for (let i = 0; i < count; i++) {
    const r = disassembleOne(readFn, pc);
    out.push(r);
    pc = (pc + r.length) & 0xffff;
  }
  return out;
};
