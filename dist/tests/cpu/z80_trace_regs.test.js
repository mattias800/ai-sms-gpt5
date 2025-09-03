import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 traceRegs snapshot', () => {
    it('includes register snapshot after instruction when enabled', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD B,0x12; NOP
        mem.set([0x06, 0x12, 0x00], 0x0000);
        const events = [];
        const cpu = createZ80({ bus, onTrace: (ev) => { events.push(ev); }, traceRegs: true });
        expect(step(cpu)).toBe(7);
        expect(step(cpu)).toBe(4);
        expect(events.length).toBe(2);
        const e0 = events[0];
        expect(e0.regs).toBeDefined();
        expect(e0.regs.b).toBe(0x12);
        expect(e0.regs.pc).toBe(0x0002);
    });
    it('snapshot reflects state after IM1 interrupt acceptance (PC=0x0038)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 1; EI; HALT
        mem.set([0xed, 0x56, 0xfb, 0x76], 0x0000);
        const events = [];
        const cpu = createZ80({ bus, onTrace: (ev) => { events.push(ev); }, traceRegs: true });
        step(cpu); // IM1
        step(cpu); // EI
        step(cpu); // HALT
        cpu.requestIRQ();
        const c = step(cpu); // accept IM1
        expect(c).toBe(13);
        const last = events[events.length - 1];
        expect(last.irqAccepted).toBe(true);
        expect(last.opcode).toBeNull();
        expect(last.regs).toBeDefined();
        expect(last.regs.pc).toBe(0x0038);
    });
});
//# sourceMappingURL=z80_trace_regs.test.js.map