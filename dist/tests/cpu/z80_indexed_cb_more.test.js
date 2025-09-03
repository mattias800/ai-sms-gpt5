import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_Z } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
const setIX = (cpu, ix) => {
    const st = cpu.getState();
    cpu.setState({ ...st, ix: ix & 0xffff });
};
const setIY = (cpu, iy) => {
    const st = cpu.getState();
    cpu.setState({ ...st, iy: iy & 0xffff });
};
describe('DD/FD CB d additional coverage', () => {
    it('DD CB d RRC (IX+d),A updates memory and A; cycles 23', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD CB 01 0F : RRC (IX+1),A ; HALT
        mem.set([0xdd, 0xcb, 0x01, 0x0f, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x4100);
        mem[0x4101] = 0x02; // -> 0x01, C=0
        const c = step(cpu);
        expect(c).toBe(23);
        const st = cpu.getState();
        expect(st.a).toBe(0x01);
        expect(mem[0x4101]).toBe(0x01);
    });
    it('DD CB d BIT 0,(IX+d) sets Z=1 and preserves C; cycles 20', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD CB 02 46 : BIT 0,(IX+2) ; HALT
        mem.set([0xdd, 0xcb, 0x02, 0x46, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x4200);
        // set carry beforehand
        let st = cpu.getState();
        cpu.setState({ ...st, f: st.f | FLAG_C });
        mem[0x4202] = 0x00;
        const c = step(cpu);
        expect(c).toBe(20);
        st = cpu.getState();
        expect((st.f & FLAG_Z) !== 0).toBe(true);
        expect((st.f & FLAG_C) !== 0).toBe(true);
    });
    it('FD CB d RES 7,(IY+d),A and SET 7,(IY+d),B; cycles 23', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // FD CB 03 8F : RES 1? No, 0x8F = RES 1,A normally; 0x87 = RES 0,A; we want RES 7,A: base is 0xBF (0x80 + (7<<3) + 7)
        // We'll do RES 7,(IY+3),A then SET 0,(IY+3),B to cover both groups
        mem.set([0xfd, 0xcb, 0x03, 0xbf, 0xfd, 0xcb, 0x03, 0xc0, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIY(cpu, 0x4300);
        mem[0x4303] = 0xff;
        let c = step(cpu);
        expect(c).toBe(23);
        let st = cpu.getState();
        // After RES 7, memory should have 0x7F and A receives 0x7F
        expect(mem[0x4303]).toBe(0x7f);
        expect(st.a).toBe(0x7f);
        // Prepare B before SET 0
        st = cpu.getState();
        cpu.setState({ ...st, b: 0x00 });
        c = step(cpu);
        expect(c).toBe(23);
        // SET 0,(IY+3): memory bit0 set
        expect(mem[0x4303] & 0x01).toBe(0x01);
    });
});
// Additional arithmetic variants on (IY+d): AND/XOR/OR/CP
describe('DD/FD arithmetic with (IX/IY+d)', () => {
    it('AND/XOR/OR/CP A,(IY+d) all take 19 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Sequence: LD A,0xF0; AND (IY+0); LD A,0x55; XOR (IY+0); LD A,0x0F; OR (IY+0); LD A,0x80; CP (IY+0); HALT
        mem.set([
            0x3e, 0xf0, 0xfd, 0xa6, 0x00, 0x3e, 0x55, 0xfd, 0xae, 0x00, 0x3e, 0x0f, 0xfd, 0xb6, 0x00,
            0x3e, 0x80, 0xfd, 0xbe, 0x00, 0x76,
        ], 0x0000);
        const cpu = createZ80({ bus });
        // IY base at 0x4400
        const st0 = cpu.getState();
        cpu.setState({ ...st0, iy: 0x4400 });
        mem[0x4400] = 0x0f;
        step(cpu); // LD A,0xF0
        let c = step(cpu); // AND (IY+0)
        expect(c).toBe(19);
        let st = cpu.getState();
        expect(st.a).toBe(0x00);
        step(cpu); // LD A,0x55
        c = step(cpu); // XOR (IY+0)
        expect(c).toBe(19);
        st = cpu.getState();
        expect(st.a).toBe(0x5a);
        step(cpu); // LD A,0x0F
        c = step(cpu); // OR (IY+0)
        expect(c).toBe(19);
        st = cpu.getState();
        expect(st.a).toBe(0x0f);
        step(cpu); // LD A,0x80
        c = step(cpu); // CP (IY+0)
        expect(c).toBe(19);
        st = cpu.getState();
        // A unchanged, Z=0 for 0x80 cmp 0x0f
        expect(st.a).toBe(0x80);
        expect((st.f & FLAG_Z) !== 0).toBe(false);
    });
});
//# sourceMappingURL=z80_indexed_cb_more.test.js.map