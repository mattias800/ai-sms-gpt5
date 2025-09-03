import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_H } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 16-bit ADD/ADC HL flags (H and C paths)', () => {
    it('ADD HL,BC sets H without C for 0x0FFF + 0x0001', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD HL,0x0fff; LD BC,0x0001; ADD HL,BC
        mem.set([0x21, 0xff, 0x0f, 0x01, 0x01, 0x00, 0x09], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD HL
        step(cpu); // LD BC
        step(cpu); // ADD HL,BC
        const st = cpu.getState();
        expect(((st.h << 8) | st.l) & 0xffff).toBe(0x1000);
        expect((st.f & FLAG_H) !== 0).toBe(true);
        expect((st.f & FLAG_C) !== 0).toBe(false);
    });
    it('ADD HL,SP sets both H and C for 0xFFFF + 0x0001', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD HL,0xffff; LD SP,0x0001; ADD HL,SP
        mem.set([0x21, 0xff, 0xff, 0x31, 0x01, 0x00, 0x39], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD HL
        step(cpu); // LD SP
        step(cpu); // ADD HL,SP
        const st = cpu.getState();
        expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0000);
        expect((st.f & FLAG_H) !== 0).toBe(true);
        expect((st.f & FLAG_C) !== 0).toBe(true);
    });
    it('ED: ADC HL,DE with carry in', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD HL,0x0001; LD DE,0x0001; ADC HL,DE (ED 5A)
        mem.set([0x21, 0x01, 0x00, 0x11, 0x01, 0x00, 0xed, 0x5a], 0x0000);
        const cpu = createZ80({ bus });
        // Set initial carry
        const s0 = cpu.getState();
        cpu.setState({ ...s0, f: s0.f | FLAG_C });
        step(cpu); // LD HL
        step(cpu); // LD DE
        step(cpu); // ADC HL,DE
        const st = cpu.getState();
        expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0003);
        // Ensure H is clear here (no crossing of bit 11), C clear
        expect((st.f & FLAG_H) !== 0).toBe(false);
        expect((st.f & FLAG_C) !== 0).toBe(false);
    });
});
//# sourceMappingURL=z80_16bit_add_adc_flags.test.js.map