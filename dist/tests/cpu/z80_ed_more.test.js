import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_N, FLAG_Z } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 ED-prefixed more cases', () => {
    it('LD (nn),SP then LD SP,(nn) roundtrip (cycles 20 each)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD (0x4004),SP; LD SP,(0x4004); HALT
        mem.set([0xed, 0x73, 0x04, 0x40, 0xed, 0x7b, 0x04, 0x40, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        // Set SP to known value and execute store
        let st = cpu.getState();
        cpu.setState({ ...st, sp: 0xabcd });
        expect(step(cpu)).toBe(20); // LD (nn),SP
        expect(mem[0x4004]).toBe(0xcd);
        expect(mem[0x4005]).toBe(0xab);
        // Change SP to zero and reload from memory
        st = cpu.getState();
        cpu.setState({ ...st, sp: 0x0000 });
        expect(step(cpu)).toBe(20); // LD SP,(nn)
        expect(cpu.getState().sp).toBe(0xabcd);
    });
    it('RETN and RETI pop PC and set IFF1 = IFF2', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: RETN; HALT
        mem.set([0xed, 0x45, 0x76], 0x0000);
        // Prepare stack with 0x1234 at SP
        mem[0xfffe] = 0x34;
        mem[0xffff] = 0x12;
        const cpu = createZ80({ bus });
        let st = cpu.getState();
        cpu.setState({ ...st, sp: 0xfffe, iff2: true, iff1: false });
        expect(step(cpu)).toBe(14);
        st = cpu.getState();
        expect(st.pc).toBe(0x1234);
        expect(st.iff1).toBe(true);
        // Now RETI
        mem.set([0xed, 0x4d, 0x76], 0x0000);
        mem[0xfffc] = 0x78;
        mem[0xfffd] = 0x56;
        st = cpu.getState();
        cpu.setState({ ...st, sp: 0xfffc, iff2: false, iff1: true, pc: 0x0000 });
        expect(step(cpu)).toBe(14);
        st = cpu.getState();
        expect(st.pc).toBe(0x5678);
        expect(st.iff1).toBe(false);
    });
    it('IM 0 and IM 2 set mode and take 8 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; IM 2; HALT
        mem.set([0xed, 0x46, 0xed, 0x5e, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        expect(step(cpu)).toBe(8);
        expect(cpu.getState().im).toBe(0);
        expect(step(cpu)).toBe(8);
        expect(cpu.getState().im).toBe(2);
    });
    it('ADC HL,SP and SBC HL,HL results and flags basics', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: ADC HL,SP; SBC HL,HL; HALT
        mem.set([0xed, 0x7a, 0xed, 0x62, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        let st = cpu.getState();
        cpu.setState({ ...st, h: 0x80, l: 0x00, sp: 0x7fff, f: 0 });
        // ADC HL,SP -> 0xFFFF
        expect(step(cpu)).toBe(15);
        st = cpu.getState();
        expect(((st.h << 8) | st.l) & 0xffff).toBe(0xffff);
        // SBC HL,HL -> 0x0000, Z=1, N=1
        expect(step(cpu)).toBe(15);
        st = cpu.getState();
        expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0000);
        expect((st.f & FLAG_Z) !== 0).toBe(true);
        expect((st.f & FLAG_N) !== 0).toBe(true);
    });
});
//# sourceMappingURL=z80_ed_more.test.js.map