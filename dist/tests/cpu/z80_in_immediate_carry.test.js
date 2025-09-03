import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C } from '../../src/cpu/z80/flags.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 IN A,(n) preserves carry flag', () => {
    it('IN A,(0x7f) keeps C if it was set', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xdb, 0x7f], 0x0000);
        const cpu = createZ80({ bus });
        const s0 = cpu.getState();
        cpu.setState({ ...s0, f: s0.f | FLAG_C });
        const c = step(cpu);
        expect(c).toBe(11);
        const st = cpu.getState();
        expect((st.f & FLAG_C) !== 0).toBe(true);
    });
});
//# sourceMappingURL=z80_in_immediate_carry.test.js.map