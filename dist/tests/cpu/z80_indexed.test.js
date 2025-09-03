import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_H, FLAG_N, FLAG_PV } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
const setIX = (cpu, ix) => {
    const st = cpu.getState();
    cpu.setState({ ...st, ix: ix & 0xffff });
};
const setIY = (cpu, iy) => {
    const st = cpu.getState();
    cpu.setState({ ...st, iy: iy & 0xffff });
};
describe('Z80 DD/FD indexed addressing (IX/IY)', () => {
    it('LD (IX+d),n stores byte and takes 19 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD 36 d n ; HALT
        mem.set([0xdd, 0x36, 0x0f, 0xab, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x4000);
        const c = step(cpu);
        expect(c).toBe(19);
        expect(mem[0x400f]).toBe(0xab);
    });
    it('LD A,(IX+d) and LD (IX+d),A roundtrip (19 cycles each)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD A,0x55; LD (IX+1),A; LD A,0x00; LD A,(IX+1); HALT
        mem.set([0x3e, 0x55, 0xdd, 0x77, 0x01, 0x3e, 0x00, 0xdd, 0x7e, 0x01, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x2000);
        step(cpu); // LD A,0x55
        expect(step(cpu)).toBe(19); // LD (IX+1),A
        step(cpu); // LD A,0x00
        expect(step(cpu)).toBe(19); // LD A,(IX+1)
        const st = cpu.getState();
        expect(st.a).toBe(0x55);
        expect(mem[0x2001]).toBe(0x55);
    });
    it('INC (IX+d) and DEC (IX+d) update flags and take 23 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: INC (IX+2); DEC (IX+2); HALT
        mem.set([0xdd, 0x34, 0x02, 0xdd, 0x35, 0x02, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x3000);
        // Seed memory at 0x3002 with 0x7f to trigger PV on INC
        mem[0x3002] = 0x7f;
        let c = step(cpu);
        expect(c).toBe(23);
        let st = cpu.getState();
        expect(mem[0x3002]).toBe(0x80);
        expect((st.f & FLAG_PV) !== 0).toBe(true);
        c = step(cpu);
        expect(c).toBe(23);
        st = cpu.getState();
        expect(mem[0x3002]).toBe(0x7f);
        expect((st.f & FLAG_N) !== 0).toBe(true);
    });
    it('ADD A,(IX+d) and SUB (IY+d) with cycles and flags', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD A,0x10; ADD A,(IX+3); LD A,0x00; SUB (IY-1); HALT
        mem.set([0x3e, 0x10, 0xdd, 0x86, 0x03, 0x3e, 0x00, 0xfd, 0x96, 0xff, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x1000);
        setIY(cpu, 0x1800);
        mem[0x1003] = 0x20; // ADD => 0x30
        mem[0x17ff] = 0x01; // SUB => 0xff
        step(cpu); // LD A,0x10
        let c = step(cpu); // ADD A,(IX+3)
        expect(c).toBe(19);
        let st = cpu.getState();
        expect(st.a).toBe(0x30);
        step(cpu); // LD A,0x00
        c = step(cpu); // SUB (IY-1)
        expect(c).toBe(19);
        st = cpu.getState();
        expect(st.a).toBe(0xff);
        expect((st.f & FLAG_H) !== 0).toBe(true);
    });
    it('LD B,(IY+d) and LD (IY+d),B operate like IX variants', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD B,0x9a; LD (IY+0),B; LD B,0x00; LD B,(IY+0); HALT
        mem.set([0x06, 0x9a, 0xfd, 0x70, 0x00, 0x06, 0x00, 0xfd, 0x46, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIY(cpu, 0x2200);
        step(cpu); // LD B,0x9a
        expect(step(cpu)).toBe(19); // LD (IY+0),B
        step(cpu); // LD B,0x00
        expect(step(cpu)).toBe(19); // LD B,(IY+0)
        const st = cpu.getState();
        expect(st.b).toBe(0x9a);
        expect(mem[0x2200]).toBe(0x9a);
    });
    it('supports DD/FD register variants: LD B,IXH via DD 44', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD 44 is LD B,H -> with DD maps H->IXH
        mem.set([0xdd, 0x44], 0x0000);
        const cpu = createZ80({ bus });
        // Set IX = 0xABCD
        const st = cpu.getState();
        cpu.setState({ ...st, ix: 0xabcd });
        const c = cpu.stepOne().cycles;
        expect(c).toBe(4);
        expect(cpu.getState().b).toBe(0xab);
    });
});
//# sourceMappingURL=z80_indexed.test.js.map