import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_C, FLAG_H, FLAG_N, FLAG_PV, FLAG_S } from '../../src/cpu/z80/flags.js';
const runSteps = (cpu, steps) => {
    let cycles = 0;
    for (let i = 0; i < steps; i++)
        cycles += cpu.stepOne().cycles;
    return cycles;
};
describe('Z80 basic ops', () => {
    it('LD r,n; LD r,r; NOP; HALT', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program at 0x0000: LD B,0x12; LD A,B; NOP; HALT
        mem.set([0x06, 0x12, 0x78, 0x00, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        let c = runSteps(cpu, 1); // LD B,n
        expect(c).toBe(7);
        c = runSteps(cpu, 1); // LD A,B
        expect(c).toBe(4);
        c = runSteps(cpu, 1); // NOP
        expect(c).toBe(4);
        const st = cpu.getState();
        expect(st.b).toBe(0x12);
        expect(st.a).toBe(0x12);
        // HALT
        c = runSteps(cpu, 1);
        expect(c).toBe(4);
        const st2 = cpu.getState();
        expect(st2.halted).toBe(true);
        // Further steps keep consuming 4 cycles
        c = runSteps(cpu, 3);
        expect(c).toBe(12);
    });
    it('LD r,(HL) and LD (HL),r', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD H,0x40; LD L,0x10; LD (HL),0xAB via LD A,0xAB; LD (HL),A; LD A,(HL); HALT
        mem.set([
            0x26,
            0x40, // LD H,0x40
            0x2e,
            0x10, // LD L,0x10
            0x3e,
            0xab, // LD A,0xAB
            0x77, // LD (HL),A
            0x7e, // LD A,(HL)
            0x76, // HALT
        ], 0x0000);
        const cpu = createZ80({ bus });
        expect(runSteps(cpu, 1)).toBe(7);
        expect(runSteps(cpu, 1)).toBe(7);
        expect(runSteps(cpu, 1)).toBe(7);
        expect(runSteps(cpu, 1)).toBe(7); // (HL),A
        expect(runSteps(cpu, 1)).toBe(7); // A,(HL)
        const st = cpu.getState();
        expect((st.h << 8) | st.l).toBe(0x4010);
        expect(st.a).toBe(0xab);
        expect(mem[0x4010]).toBe(0xab);
    });
    it('INC/DEC r flags and C preservation', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: LD A,0x7F; INC A; DEC A; HALT
        mem.set([0x3e, 0x7f, 0x3c, 0x3d, 0x76], 0x0000);
        const cpu = createZ80({ bus });
        runSteps(cpu, 1); // LD A,0x7F
        runSteps(cpu, 1); // INC A -> 0x80, sets S and PV
        let st = cpu.getState();
        expect(st.a).toBe(0x80);
        expect((st.f & FLAG_S) !== 0).toBe(true);
        expect((st.f & FLAG_PV) !== 0).toBe(true);
        expect((st.f & FLAG_N) !== 0).toBe(false);
        runSteps(cpu, 1); // DEC A -> 0x7F, sets PV and N
        st = cpu.getState();
        expect(st.a).toBe(0x7f);
        expect((st.f & FLAG_N) !== 0).toBe(true);
        expect((st.f & FLAG_PV) !== 0).toBe(true);
    });
    it('ADD/SUB/AND/XOR/OR/CP with immediate and registers', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program:
        // LD A,0x10; LD B,0x0F; ADD A,B -> 0x1F (no overflow), H set; SUB 0x20 -> underflow sets C; AND 0x0F; XOR 0xFF; OR 0x00; CP 0x8F; HALT
        mem.set([
            0x3e,
            0x10, // LD A,0x10
            0x06,
            0x0f, // LD B,0x0F
            0x80, // ADD A,B
            0xd6,
            0x20, // SUB 0x20
            0xe6,
            0x0f, // AND 0x0F
            0xee,
            0xff, // XOR 0xFF
            0xf6,
            0x00, // OR 0x00
            0xfe,
            0x8f, // CP 0x8F
            0x76, // HALT
        ], 0x0000);
        const cpu = createZ80({ bus });
        runSteps(cpu, 1); // LD A
        runSteps(cpu, 1); // LD B
        runSteps(cpu, 1); // ADD A,B
        let st = cpu.getState();
        expect(st.a).toBe(0x1f);
        expect((st.f & FLAG_H) !== 0).toBe(false);
        expect((st.f & FLAG_C) !== 0).toBe(false);
        expect((st.f & FLAG_N) !== 0).toBe(false);
        runSteps(cpu, 1); // SUB 0x20
        st = cpu.getState();
        expect(st.a).toBe(0xff);
        expect((st.f & FLAG_C) !== 0).toBe(true);
        expect((st.f & FLAG_N) !== 0).toBe(true);
        runSteps(cpu, 1); // AND 0x0F
        st = cpu.getState();
        expect(st.a).toBe(0x0f);
        expect((st.f & FLAG_H) !== 0).toBe(true);
        runSteps(cpu, 1); // XOR 0xFF -> 0xF0
        st = cpu.getState();
        expect(st.a).toBe(0xf0);
        expect((st.f & FLAG_H) !== 0).toBe(false);
        runSteps(cpu, 1); // OR 0x00 -> 0xF0
        st = cpu.getState();
        expect(st.a).toBe(0xf0);
        runSteps(cpu, 1); // CP 0x8F, A=0xF0 so compare result 0x61 -> S=0, N=1
        st = cpu.getState();
        expect(st.a).toBe(0xf0); // unchanged
        expect((st.f & FLAG_N) !== 0).toBe(true);
        expect((st.f & FLAG_S) !== 0).toBe(false);
    });
});
//# sourceMappingURL=z80_basics.test.js.map