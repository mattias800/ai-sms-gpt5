import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Additional branch coverage for Z80', () => {
    it('IM2 IRQ accepted immediately (preempts NOP) when next op is not HALT', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD A,0x40; LD I,A; IM 2; EI; NOP; NOP
        mem.set([0x3e, 0x40, 0xed, 0x47, 0xed, 0x5e, 0xfb, 0x00, 0x00], 0x0000);
        // Vector byte 0xA2 -> pointer at 0x40A2 -> 0x3456
        mem[0x40a2] = 0x56;
        mem[0x40a3] = 0x34;
        const cpu = createZ80({ bus });
        cpu.setIM2Vector(0xa2);
        // Setup: LD A,0x40; LD I,A; IM2; EI
        expect(step(cpu)).toBe(7);
        expect(step(cpu)).toBe(9);
        expect(step(cpu)).toBe(8);
        expect(step(cpu)).toBe(4);
        // IRQ now; EI delay masks the next NOP
        cpu.requestIRQ();
        expect(step(cpu)).toBe(4); // NOP executes (EI delay)
        // Next step: IM2 acceptance preempts the following NOP
        const c = step(cpu);
        expect(c).toBe(19);
        expect(cpu.getState().pc).toBe(0x3456);
    });
    it('FD-prefixed IY instructions (LD IY,nn and INC IY)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD IY,0x1234; INC IY
        mem.set([0xfd, 0x21, 0x34, 0x12, 0xfd, 0x23], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(14);
        expect(cpu.getState().iy).toBe(0x1234);
        c = step(cpu);
        expect(c).toBe(10);
        expect(cpu.getState().iy).toBe(0x1235);
    });
});
//# sourceMappingURL=z80_additional_branch_coverage.test.js.map