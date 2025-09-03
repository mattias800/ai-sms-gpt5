import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_H, FLAG_N, FLAG_Z } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 accumulator rotates/flag ops, EX/EXX, DAA', () => {
    it('RLCA and RRCA update A and C correctly', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD A,0x81; RLCA; LD A,0x01; RRCA
        mem.set([0x3e, 0x81, 0x07, 0x3e, 0x01, 0x0f], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(7); // LD A,0x81
        c = step(cpu);
        expect(c).toBe(4); // RLCA
        let st = cpu.getState();
        expect(st.a).toBe(0x03);
        expect((st.f & FLAG_C) !== 0).toBe(true);
        c = step(cpu);
        expect(c).toBe(7); // LD A,0x01
        c = step(cpu);
        expect(c).toBe(4); // RRCA
        st = cpu.getState();
        expect(st.a).toBe(0x80);
        expect((st.f & FLAG_C) !== 0).toBe(true);
    });
    it('RLA and RRA rotate through carry', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // RLA with C=1 and A=0x80; RRA with C=1 and A=0x01
        mem.set([0x17, 0x1f], 0x0000);
        const cpu = createZ80({ bus });
        // Seed A=0x80 and C=1
        const s0 = cpu.getState();
        cpu.setState({ ...s0, a: 0x80, f: s0.f | FLAG_C });
        let c = step(cpu);
        expect(c).toBe(4);
        let st = cpu.getState();
        expect(st.a).toBe(0x01);
        expect((st.f & FLAG_C) !== 0).toBe(true);
        // Seed A=0x01 and C=1 for RRA
        cpu.setState({ ...st, a: 0x01, f: (st.f | FLAG_C) & 0xff });
        c = step(cpu);
        expect(c).toBe(4);
        st = cpu.getState();
        expect(st.a).toBe(0x80);
        expect((st.f & FLAG_C) !== 0).toBe(true);
    });
    it('CPL sets H and N, preserves C', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0x2f], 0x0000); // CPL
        const cpu = createZ80({ bus });
        const s0 = cpu.getState();
        // Seed A and C
        cpu.setState({ ...s0, a: 0x00, f: s0.f | FLAG_C });
        step(cpu);
        const st = cpu.getState();
        expect(st.a).toBe(0xff);
        expect((st.f & FLAG_H) !== 0).toBe(true);
        expect((st.f & FLAG_N) !== 0).toBe(true);
        expect((st.f & FLAG_C) !== 0).toBe(true);
    });
    it('SCF sets carry and clears H/N; CCF toggles carry and sets H=prevC', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0x37, 0x3f], 0x0000); // SCF; CCF
        const cpu = createZ80({ bus });
        // After SCF, C=1
        step(cpu);
        let st = cpu.getState();
        expect((st.f & FLAG_C) !== 0).toBe(true);
        // After CCF with C=1, C clears and H becomes 1
        step(cpu);
        st = cpu.getState();
        expect((st.f & FLAG_C) !== 0).toBe(false);
        expect((st.f & FLAG_H) !== 0).toBe(true);
    });
    it('DAA adjusts A correctly after addition (0x9A + adjust = 0x00 with C and Z set)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DAA
        mem.set([0x27], 0x0000);
        const cpu = createZ80({ bus });
        const s0 = cpu.getState();
        // Seed A=0x9A and N=0, H=0, C=0
        cpu.setState({ ...s0, a: 0x9a, f: 0 });
        step(cpu);
        const st = cpu.getState();
        expect(st.a).toBe(0x00);
        expect((st.f & FLAG_C) !== 0).toBe(true);
        expect((st.f & FLAG_Z) !== 0).toBe(true);
    });
    it("EX AF,AF' swaps primary and alternate AF; EXX swaps BC/DE/HL with alternates", () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // EX AF,AF'; EXX
        mem.set([0x08, 0xd9], 0x0000);
        const cpu = createZ80({ bus });
        const s0 = cpu.getState();
        cpu.setState({
            ...s0,
            a: 0x12,
            f: 0x34,
            a_: 0x56,
            f_: 0x78,
            b: 1, c: 2, d: 3, e: 4, h: 5, l: 6,
            b_: 0xa, c_: 0xb, d_: 0xc, e_: 0xd, h_: 0xe, l_: 0xf,
        });
        // EX AF,AF'
        step(cpu);
        let st = cpu.getState();
        expect(st.a).toBe(0x56);
        expect(st.f).toBe(0x78);
        expect(st.a_).toBe(0x12);
        expect(st.f_).toBe(0x34);
        // EXX
        step(cpu);
        st = cpu.getState();
        expect([st.b, st.c, st.d, st.e, st.h, st.l]).toEqual([0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
        expect([st.b_, st.c_, st.d_, st.e_, st.h_, st.l_]).toEqual([1, 2, 3, 4, 5, 6]);
    });
});
//# sourceMappingURL=z80_flag_ops_ex_daa.test.js.map