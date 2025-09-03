import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 INC dd variants to cover branches', () => {
    it('INC DE and INC SP update correctly (6 cycles each)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD DE,0xffff; INC DE; LD SP,0x0000; INC SP
        mem.set([0x11, 0xff, 0xff, 0x13, 0x31, 0x00, 0x00, 0x33], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD DE
        let c = step(cpu);
        expect(c).toBe(6);
        let st = cpu.getState();
        expect(((st.d << 8) | st.e) & 0xffff).toBe(0x0000);
        step(cpu); // LD SP
        c = step(cpu);
        expect(c).toBe(6);
        st = cpu.getState();
        expect(st.sp).toBe(0x0001);
    });
});
//# sourceMappingURL=z80_inc_variants.test.js.map