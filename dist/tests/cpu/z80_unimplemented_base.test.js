import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
describe('Base opcode basic behavior', () => {
    it('executes 0x01 (LD BC,nn) and sets BC correctly', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0x01, 0x34, 0x12], 0x0000);
        const cpu = createZ80({ bus });
        const cycles = cpu.stepOne().cycles;
        expect(cycles).toBe(10);
        const st = cpu.getState();
        expect(st.b).toBe(0x12);
        expect(st.c).toBe(0x34);
    });
});
//# sourceMappingURL=z80_unimplemented_base.test.js.map