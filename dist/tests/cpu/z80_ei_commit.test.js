import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
describe('Z80 EI pending commit after CP n', () => {
    it('enables interrupts after CP when EI was issued', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: EI; CP 0x01; HALT
        mem.set([0xfb, 0xfe, 0x01, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        // EI sets pending
        cpu.stepOne();
        // CP immediate should commit EI pending
        cpu.stepOne();
        const st = cpu.getState();
        expect(st.iff1).toBe(true);
        expect(st.iff2).toBe(true);
    });
});
//# sourceMappingURL=z80_ei_commit.test.js.map