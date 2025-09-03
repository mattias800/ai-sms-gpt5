import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('DD/FD IXH/IXL arithmetic more coverage (register sources)', () => {
    it('AND/XOR/OR with IXH/IXL and SBC A,IXL execute register paths (4 cycles)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program:
        // DD 26 F0    ; IXH = 0xF0
        // 3E 0F       ; A = 0x0F
        // DD A4       ; AND H => AND IXH => A=0x00
        // DD 26 55    ; IXH = 0x55
        // 3E AA       ; A = 0xAA
        // DD AC       ; XOR H => XOR IXH => A=0xFF
        // DD 2E F0    ; IXL = 0xF0
        // 3E 0F       ; A = 0x0F
        // DD B5       ; OR L  => OR IXL  => A=0xFF
        // 3E 20       ; A = 0x20
        // 37          ; SCF (set carry)
        // DD 2E 01    ; IXL = 0x01
        // DD 9D       ; SBC A,L => SBC A,IXL => 0x20 - 1 - 1 = 0x1E
        mem.set([
            0xdd, 0x26, 0xf0,
            0x3e, 0x0f,
            0xdd, 0xa4,
            0xdd, 0x26, 0x55,
            0x3e, 0xaa,
            0xdd, 0xac,
            0xdd, 0x2e, 0xf0,
            0x3e, 0x0f,
            0xdd, 0xb5,
            0x3e, 0x20,
            0x37,
            0xdd, 0x2e, 0x01,
            0xdd, 0x9d,
        ], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(7); // LD IXH via DD 26 nn (LD r,n under DD takes 7 cycles in our core)
        step(cpu); // LD A,0x0F
        c = step(cpu);
        expect(c).toBe(4); // AND IXH
        expect(cpu.getState().a).toBe(0x00);
        step(cpu); // LD IXH,0x55
        step(cpu); // LD A,0xAA
        c = step(cpu);
        expect(c).toBe(4); // XOR IXH
        expect(cpu.getState().a).toBe(0xff);
        step(cpu); // LD IXL,0xF0
        step(cpu); // LD A,0x0F
        c = step(cpu);
        expect(c).toBe(4); // OR IXL
        expect(cpu.getState().a).toBe(0xff);
        step(cpu); // LD A,0x20
        step(cpu); // SCF
        step(cpu); // LD IXL,0x01
        c = step(cpu);
        expect(c).toBe(4); // SBC A,IXL
        expect(cpu.getState().a).toBe(0x1e);
    });
});
//# sourceMappingURL=z80_ixiy_8bit_regs_more.test.js.map