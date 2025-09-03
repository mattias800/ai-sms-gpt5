import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 IM0 interrupts', () => {
    it('default IM0 behaves like RST 38h (vector 0x0038), 13 cycles, pushes return address and clears IFF1', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; EI; NOP; HALT
        mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        // Setup IM0 and EI
        step(cpu); // IM0
        step(cpu); // EI
        // Request IRQ and run through NOP (EI delay)
        cpu.requestIRQ();
        expect(step(cpu)).toBe(4); // NOP
        expect(step(cpu)).toBe(4); // HALT
        const before = cpu.getState();
        const c = step(cpu); // accept IM0 IRQ
        expect(c).toBe(13);
        const after = cpu.getState();
        // PC set to 0x0038
        expect(after.pc).toBe(0x0038);
        // Return address is after HALT (pc before acceptance), which was 0x0005
        const sp = after.sp & 0xffff;
        expect(mem[sp]).toBe(0x05);
        expect(mem[(sp + 1) & 0xffff]).toBe(0x00);
        // IFF1 cleared
        expect(after.iff1).toBe(false);
        // SP decreased by 2
        expect(sp).toBe((before.sp - 2) & 0xffff);
    });
    it('IM0 configurable vector jumps to provided address (e.g., 0x0028)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; EI; NOP; HALT
        mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        cpu.setIM0Vector(0x0028);
        step(cpu); // IM0
        step(cpu); // EI
        cpu.requestIRQ();
        step(cpu); // NOP (EI delay)
        step(cpu); // HALT
        const c = step(cpu);
        expect(c).toBe(13);
        expect(cpu.getState().pc).toBe(0x0028);
    });
    it('IM0 executes injected RST opcode (RST 20h via 0xE7)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; EI; NOP; HALT
        mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        cpu.setIM0Opcode(0xe7); // RST 20h
        step(cpu); // IM0
        step(cpu); // EI
        cpu.requestIRQ();
        step(cpu); // NOP (EI delay)
        step(cpu); // HALT
        const before = cpu.getState();
        const c = step(cpu);
        expect(c).toBe(13);
        const after = cpu.getState();
        expect(after.pc).toBe(0x0020);
        // IFF1 cleared and return address pushed
        const sp = after.sp & 0xffff;
        expect(after.iff1).toBe(false);
        expect(mem[sp]).toBe(0x05);
        expect(mem[(sp + 1) & 0xffff]).toBe(0x00);
        expect(sp).toBe((before.sp - 2) & 0xffff);
    });
    it('IM0 throws for unsupported injected opcode (e.g., NOP 0x00)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; EI; NOP; HALT
        mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        cpu.setIM0Opcode(0x00); // NOP is unsupported in this simplified IM0 model
        step(cpu); // IM0
        step(cpu); // EI
        cpu.requestIRQ();
        step(cpu); // NOP (EI delay)
        step(cpu); // HALT
        expect(() => {
            cpu.stepOne();
        }).toThrowError(/IM0 unsupported opcode/);
    });
    it('setIM0Opcode(null) returns to vector mode', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: IM 0; EI; NOP; HALT
        mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        cpu.setIM0Vector(0x0028);
        cpu.setIM0Opcode(0xe7); // would be RST 20h, but then cleared
        cpu.setIM0Opcode(null);
        step(cpu); // IM0
        step(cpu); // EI
        cpu.requestIRQ();
        step(cpu); // NOP
        step(cpu); // HALT
        const c = step(cpu);
        expect(c).toBe(13);
        expect(cpu.getState().pc).toBe(0x0028); // back to vector mode
    });
});
//# sourceMappingURL=z80_im0_interrupts.test.js.map