import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
describe('DD/FD arithmetic with DD prefix behaves like normal for non-index regs', () => {
    it('DD prefix with ADD A,B (0x80) executes (4 cycles)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xdd, 0x80], 0x0000);
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        cpu.setState({ ...st, a: 0x01, b: 0x02 });
        const c = cpu.stepOne().cycles;
        expect(c).toBe(4);
        expect(cpu.getState().a).toBe(0x03);
    });
});
//# sourceMappingURL=z80_ddfd_unimplemented_arith.test.js.map