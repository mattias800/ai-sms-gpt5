import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 R refresh register semantics', () => {
    it('R increments by 1 on a simple opcode fetch (NOP)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // NOP; HALT
        mem.set([0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        const st0 = cpu.getState();
        // Start with bit7 set to ensure it is preserved
        cpu.setState({ ...st0, r: 0x80 });
        step(cpu); // NOP
        const st = cpu.getState();
        // Low 7 bits incremented once; bit7 preserved
        expect(st.r & 0x80).toBe(0x80);
        expect(st.r & 0x7f).toBe(0x01);
    });
    it('LD A,R (ED 5F) causes two M1 increments (prefix + opcode)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // ED 5F ; HALT
        mem.set([0xed, 0x5f, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        const st0 = cpu.getState();
        cpu.setState({ ...st0, r: 0x00 });
        step(cpu); // LD A,R
        const st = cpu.getState();
        // R low should be 2, A should read that value
        expect(st.r & 0x7f).toBe(0x02);
        expect(st.a & 0x7f).toBe(0x02);
    });
    it('CB prefix increments R twice (prefix + opcode)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // CB 00 (RLC B); HALT
        mem.set([0xcb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        const st0 = cpu.getState();
        cpu.setState({ ...st0, r: 0x00 });
        step(cpu); // CB 00
        const st = cpu.getState();
        expect(st.r & 0x7f).toBe(0x02);
    });
    it('DD CB d op sequence increments R three times (DD + CB + op)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD CB 00 06  => RLC (IX+0)
        mem.set([0xdd, 0xcb, 0x00, 0x06, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        const st0 = cpu.getState();
        cpu.setState({ ...st0, r: 0x00, ix: 0x4000 });
        step(cpu); // DD CB 00 06
        const st = cpu.getState();
        expect(st.r & 0x7f).toBe(0x03);
    });
});
//# sourceMappingURL=z80_refresh_r.test.js.map