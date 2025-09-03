import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 resetInterruptConfig helper', () => {
    it('resets IM0 vector, IM2 vector byte, and IM0 opcode to defaults', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; EI; NOP; HALT
        mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        // Set custom config
        cpu.setIM0Vector(0x0028);
        cpu.setIM2Vector(0xa2);
        cpu.setIM0Opcode(0xe7);
        // Reset to defaults
        cpu.resetInterruptConfig();
        // Verify IM0 behaves as default RST 38h again
        step(cpu); // IM0
        step(cpu); // EI
        cpu.requestIRQ();
        step(cpu); // NOP
        step(cpu); // HALT
        const c = step(cpu);
        expect(c).toBe(13);
        expect(cpu.getState().pc).toBe(0x0038);
    });
});
//# sourceMappingURL=z80_interrupt_config_reset.test.js.map