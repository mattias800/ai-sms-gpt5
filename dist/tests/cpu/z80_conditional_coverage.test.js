import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 conditional coverage and ED SBC HL,ss', () => {
    it('covers JP cc for NC/C/PO/PE/P/M cases via flags', () => {
        const cases = [
            // JP NC,nn (0xD2): take when C==0 -> make not taken by setting C=1
            { op: 0xd2, setF: (f) => f | 0x01, expectJump: false },
            // JP C,nn (0xDA): take when C==1
            { op: 0xda, setF: (f) => f | 0x01, expectJump: true },
            // JP PO,nn (0xE2): take when PV==0
            { op: 0xe2, setF: (f) => f & ~0x04, expectJump: true },
            // JP PE,nn (0xEA): take when PV==1
            { op: 0xea, setF: (f) => f | 0x04, expectJump: true },
            // JP P,nn (0xF2): take when S==0
            { op: 0xf2, setF: (f) => f & ~0x80, expectJump: true },
            // JP M,nn (0xFA): take when S==1
            { op: 0xfa, setF: (f) => f | 0x80, expectJump: true },
        ];
        for (const t of cases) {
            const bus = new SimpleBus();
            const mem = bus.getMemory();
            mem.set([t.op, 0x34, 0x12], 0x0000); // JP cc,0x1234
            const cpu = createZ80({ bus });
            const st = cpu.getState();
            cpu.setState({ ...st, f: t.setF(st.f) });
            const c = step(cpu);
            expect(c).toBe(10);
            const pc = cpu.getState().pc;
            expect(pc).toBe(t.expectJump ? 0x1234 : 0x0003);
        }
    });
    it('CALL cc taken path (CALL Z,nn)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // CALL Z,0040h
        mem.set([0xcc, 0x40, 0x00], 0x0000);
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        // Set Z=1
        cpu.setState({ ...st, f: (st.f | 0x40) & 0xff });
        const c = step(cpu);
        expect(c).toBe(17);
        expect(cpu.getState().pc).toBe(0x0040);
    });
    it('RET cc taken path (RET C)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Place RET C at 0x0100
        mem.set([0xd8], 0x0100);
        const cpu = createZ80({ bus });
        // Prepare stack with return address 0x1234
        const st = cpu.getState();
        cpu.setState({ ...st, sp: 0x8000, f: (st.f | 0x01) & 0xff, pc: 0x0100 });
        mem[0x8000] = 0x34;
        mem[0x8001] = 0x12;
        const c = step(cpu);
        expect(c).toBe(11);
        expect(cpu.getState().pc).toBe(0x1234);
    });
    it('ED 42: SBC HL,BC updates HL and takes 15 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // SBC HL,BC
        mem.set([0xed, 0x42], 0x0000);
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        // HL=1000h, BC=0001h, C=1 => HL := 1000h - 0001h - 1 = 0x0FFE
        cpu.setState({ ...st, h: 0x10, l: 0x00, b: 0x00, c: 0x01, f: (st.f | 0x01) & 0xff });
        const c = step(cpu);
        expect(c).toBe(15);
        const st2 = cpu.getState();
        expect(((st2.h << 8) | st2.l) & 0xffff).toBe(0x0ffe);
    });
});
//# sourceMappingURL=z80_conditional_coverage.test.js.map