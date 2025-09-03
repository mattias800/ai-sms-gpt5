import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
const setIX = (cpu, ix) => {
    const st = cpu.getState();
    cpu.setState({ ...st, ix: ix & 0xffff });
};
const setIY = (cpu, iy) => {
    const st = cpu.getState();
    cpu.setState({ ...st, iy: iy & 0xffff });
};
describe('DD/FD CB d operations on (IX/IY+d)', () => {
    it('DD CB d RLC (IX+d),B writes back and transfers to B (23 cycles)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: DD CB 02 00 (RLC (IX+2),B); HALT
        mem.set([0xdd, 0xcb, 0x02, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x4000);
        mem[0x4002] = 0x81; // -> 0x03 with C=1
        const c = step(cpu);
        expect(c).toBe(23);
        const st = cpu.getState();
        expect(st.b).toBe(0x03);
        expect(mem[0x4002]).toBe(0x03);
    });
    it('DD CB d BIT 7,(IX+d) sets flags and takes 20 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD CB FF 7E (BIT 7,(IX-1)); HALT
        mem.set([0xdd, 0xcb, 0xff, 0x7e, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIX(cpu, 0x3000);
        mem[0x2fff] = 0x80;
        const c = step(cpu);
        expect(c).toBe(20);
        const st = cpu.getState();
        expect((st.f & 0x80) !== 0).toBe(true); // S set
        expect((st.f & 0x40) !== 0).toBe(false); // Z clear
    });
    it('FD CB d RES and SET operate on memory and optional register target (23 cycles)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // FD CB 00 86 (RES 0,(IY+0)) ; FD CB 00 C0 (SET 0,(IY+0)) ; HALT
        mem.set([0xfd, 0xcb, 0x00, 0x86, 0xfd, 0xcb, 0x00, 0xc0, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        setIY(cpu, 0x2800);
        mem[0x2800] = 0xff;
        let c = step(cpu);
        expect(c).toBe(23);
        expect(mem[0x2800]).toBe(0xfe);
        c = step(cpu);
        expect(c).toBe(23);
        expect(mem[0x2800]).toBe(0xff);
    });
});
//# sourceMappingURL=z80_indexed_cb.test.js.map