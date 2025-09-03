import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { disassembleOne } from '../../src/cpu/z80/disasm.js';
const wrap = (bus) => (addr) => bus.read8(addr);
describe('Z80 disassembler basics', () => {
    it('disassembles base opcodes (IN/OUT/LD/JP/JR/DJNZ)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        const seq = [
            0xd3, 0xbe, // OUT (BE),A
            0xdb, 0xbf, // IN A,(BF)
            0x06, 0x12, // LD B,12
            0x36, 0x34, // LD (HL),34
            0xc3, 0x34, 0x12, // JP 1234
            0x18, 0xfe, // JR -2
            0x20, 0x02, // JR NZ,+2
            0x10, 0xff, // DJNZ -1
        ];
        mem.set(seq, 0x0000);
        const r = disassembleOne(wrap(bus), 0x0000);
        expect(r.text).toBe('OUT (BE),A');
        expect(r.length).toBe(2);
        const r2 = disassembleOne(wrap(bus), 0x0002);
        expect(r2.text).toBe('IN A,(BF)');
        const r3 = disassembleOne(wrap(bus), 0x0004);
        expect(r3.text).toBe('LD B,12');
        const r4 = disassembleOne(wrap(bus), 0x0006);
        expect(r4.text).toBe('LD (HL),34');
        const r5 = disassembleOne(wrap(bus), 0x0008);
        expect(r5.text).toBe('JP 1234');
        const r6 = disassembleOne(wrap(bus), 0x000B);
        expect(r6.text).toBe('JR -2');
        const r7 = disassembleOne(wrap(bus), 0x000D);
        expect(r7.text).toBe('JR NZ,2');
        const r8 = disassembleOne(wrap(bus), 0x000F);
        expect(r8.text).toBe('DJNZ -1');
    });
    it('disassembles ED IM and LD (nn),ss / ss,(nn)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        const seq = [
            0xed, 0x5e, // IM 2
            0xed, 0x43, 0x00, 0x20, // LD (2000),BC
            0xed, 0x7b, 0x34, 0x12, // LD SP,(1234)
            0xed, 0xb0, // LDIR
            0xed, 0xb1, // CPIR
        ];
        mem.set(seq, 0x0100);
        expect(disassembleOne(wrap(bus), 0x0100).text).toBe('IM 2');
        expect(disassembleOne(wrap(bus), 0x0102).text).toBe('LD (2000),BC');
        expect(disassembleOne(wrap(bus), 0x0106).text).toBe('LD SP,(1234)');
        expect(disassembleOne(wrap(bus), 0x010A).text).toBe('LDIR');
        expect(disassembleOne(wrap(bus), 0x010C).text).toBe('CPIR');
    });
    it('disassembles DD/FD indexed forms', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        const seq = [
            0xdd, 0x36, 0x05, 0x99, // LD (IX+5),99
            0xfd, 0xe9, // JP (IY)
            0xdd, 0x46, 0xFE, // LD B,(IX-2) via matrix
            0xfd, 0x70, 0x01, // LD (IY+1),B via matrix
            0xdd, 0xcb, 0x02, 0x46, // BIT 0,(IX+2)
        ];
        mem.set(seq, 0x0200);
        expect(disassembleOne(wrap(bus), 0x0200).text).toBe('LD (IX+5),99');
        expect(disassembleOne(wrap(bus), 0x0204).text).toBe('JP (IY)');
        expect(disassembleOne(wrap(bus), 0x0206).text).toBe('LD B,(IX+-2)');
        expect(disassembleOne(wrap(bus), 0x0209).text).toBe('LD (IY+1),B');
        expect(disassembleOne(wrap(bus), 0x020C).text).toBe('BIT 0,(IX+2)');
    });
});
//# sourceMappingURL=z80_disasm.test.js.map