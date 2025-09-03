import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_H, FLAG_N, FLAG_PV, FLAG_S, FLAG_Z } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 ED-prefixed instructions', () => {
    it('ADC HL,BC sets flags and takes 15 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD H,0x7F; LD L,0xFF; LD B,0x00; LD C,0x01; ADC HL,BC; HALT
        mem.set([0x26, 0x7f, 0x2e, 0xff, 0x06, 0x00, 0x0e, 0x01, 0xed, 0x4a, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD H
        step(cpu); // LD L
        step(cpu); // LD B
        step(cpu); // LD C
        const cycles = step(cpu); // ADC HL,BC
        expect(cycles).toBe(15);
        const st = cpu.getState();
        expect((st.h << 8) | st.l).toBe(0x8000);
        expect((st.f & FLAG_S) !== 0).toBe(true);
        expect((st.f & FLAG_Z) !== 0).toBe(false);
        expect((st.f & FLAG_PV) !== 0).toBe(true); // overflow
        expect((st.f & FLAG_H) !== 0).toBe(true); // half carry
        expect((st.f & FLAG_N) !== 0).toBe(false);
        expect((st.f & FLAG_C) !== 0).toBe(false);
    });
    it('SBC HL,DE with carry set', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD H,0x00; LD L,0x00; LD D,0x00; LD E,0x00; SCF via flags; SBC HL,DE; HALT
        mem.set([0x26, 0x00, 0x2e, 0x00, 0x16, 0x00, 0x1e, 0x00, 0xed, 0x52, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        // Set carry before executing SBC
        let st = cpu.getState();
        cpu.setState({ ...st, f: st.f | FLAG_C });
        // Init registers
        step(cpu); // LD H
        step(cpu); // LD L
        step(cpu); // LD D
        step(cpu); // LD E
        step(cpu); // SBC HL,DE
        st = cpu.getState();
        expect((st.h << 8) | st.l).toBe(0xffff);
        expect((st.f & FLAG_N) !== 0).toBe(true);
        expect((st.f & FLAG_C) !== 0).toBe(true);
        expect((st.f & FLAG_S) !== 0).toBe(true);
        expect((st.f & FLAG_Z) !== 0).toBe(false);
    });
    it('LD (nn),DE and LD HL,(nn) roundtrip, each 20 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD D,0xBE; LD E,0xEF; LD (0x4000),DE; LD HL,(0x4000); HALT
        mem.set([0x16, 0xbe, 0x1e, 0xef, 0xed, 0x53, 0x00, 0x40, 0xed, 0x6b, 0x00, 0x40, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD D
        step(cpu); // LD E
        let c = step(cpu); // LD (nn),DE
        expect(c).toBe(20);
        c = step(cpu); // LD HL,(nn)
        expect(c).toBe(20);
        const st = cpu.getState();
        expect((st.h << 8) | st.l).toBe(0xbeef);
        expect(mem[0x4000]).toBe(0xef);
        expect(mem[0x4001]).toBe(0xbe);
    });
    it('NEG sets correct flags and 8 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0x3e, 0x01, 0xed, 0x44, 0x76], 0x0000); // LD A,0x01; NEG; HALT
        const cpu = createZ80({ bus });
        step(cpu); // LD A
        const c = step(cpu); // NEG
        expect(c).toBe(8);
        const st = cpu.getState();
        expect(st.a).toBe(0xff);
        expect((st.f & FLAG_N) !== 0).toBe(true);
        expect((st.f & FLAG_C) !== 0).toBe(true);
        expect((st.f & FLAG_H) !== 0).toBe(true);
    });
    it('IM 1 sets interrupt mode, 8 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xed, 0x56, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        const c = step(cpu);
        expect(c).toBe(8);
        expect(cpu.getState().im).toBe(1);
    });
    it('LD I,A and LD A,I; LD R,A and LD A,R with flags behavior', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD A,0x55; LD I,A; LD A,0x00; LD A,I; LD A,0xAA; LD R,A; LD A,0x00; LD A,R; HALT
        mem.set([
            0x3e, 0x55, 0xed, 0x47, 0x3e, 0x00, 0xed, 0x57, 0x3e, 0xaa, 0xed, 0x4f, 0x3e, 0x00, 0xed,
            0x5f, 0x76,
        ], 0x0000);
        const cpu = createZ80({ bus });
        // Ensure IFF2=1 to see PV set on LD A,I and LD A,R
        let st = cpu.getState();
        cpu.setState({ ...st, iff2: true });
        step(cpu); // LD A,0x55
        step(cpu); // LD I,A
        step(cpu); // LD A,0x00
        step(cpu); // LD A,I -> A becomes 0x55, PV reflects IFF2
        st = cpu.getState();
        expect(st.a).toBe(0x55);
        expect((st.f & FLAG_PV) !== 0).toBe(true);
        // Now LD R,A path
        step(cpu); // LD A,0xAA
        step(cpu); // LD R,A
        step(cpu); // LD A,0x00
        step(cpu); // LD A,R
        st = cpu.getState();
        expect(st.a).toBe(st.r & 0xff);
    });
});
//# sourceMappingURL=z80_ed_prefix.test.js.map