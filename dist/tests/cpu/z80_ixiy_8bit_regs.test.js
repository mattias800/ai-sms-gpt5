import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
// Helper to run N steps
const run = (cpu, n) => { for (let i = 0; i < n; i++)
    step(cpu); };
describe('Z80 IXH/IXL and IYH/IYL 8-bit ops (DD/FD prefix)', () => {
    it('LD IXH, n; LD IXL, n; LD A,IXH; LD B,IXL', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD 26 12 => LD H,0x12 -> IXH
        // DD 2E 34 => LD L,0x34 -> IXL
        // DD 7C    => LD A,H   -> A := IXH
        // DD 45    => LD B,L   -> B := IXL
        mem.set([0xdd, 0x26, 0x12, 0xdd, 0x2e, 0x34, 0xdd, 0x7c, 0xdd, 0x45], 0x0000);
        const cpu = createZ80({ bus });
        run(cpu, 5);
        const st = cpu.getState();
        expect(st.ix).toBe(0x1234);
        expect(st.a).toBe(0x12);
        expect(st.b).toBe(0x34);
    });
    it('ALU with IXH/IXL: ADD A,IXH and CP IXL', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Set IX = 0x207F initially via LD IX,nn
        // Then set A=1; ADD A,H (DD 84) -> A = 1 + 0x20 = 0x21
        // CP L (DD BD) compare with 0x7F
        mem.set([
            0xdd, 0x21, 0x7f, 0x20, // LD IX,207Fh
            0x3e, 0x01, // LD A,1
            0xdd, 0x84, // ADD A,H => IXH
            0xdd, 0xbd // CP L => IXL
        ], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD IX,nn
        expect(cpu.getState().ix).toBe(0x207f);
        step(cpu); // LD A,1
        step(cpu); // ADD A,IXH
        expect(cpu.getState().a).toBe(0x21);
        step(cpu); // CP IXL (0x7F)
        // After CP 0x21 vs 0x7F, S=1 (negative), Z=0, N=1
        const f = cpu.getState().f;
        expect((f & 0x80) !== 0).toBe(true); // S
        expect((f & 0x40) === 0).toBe(true); // Z
        expect((f & 0x02) !== 0).toBe(true); // N
    });
    it('INC IXH sets flags; DEC IYL sets flags', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // DD 26 7F => IXH=0x7F
        // DD 24    => INC H => INC IXH -> becomes 0x80 (sets S and PV)
        // FD 21 00 80 => IY=0x8000
        // FD 2D    => DEC L => DEC IYL -> 0xFF
        mem.set([
            0xdd, 0x26, 0x7f,
            0xdd, 0x24,
            0xfd, 0x21, 0x00, 0x80,
            0xfd, 0x2d,
        ], 0x0000);
        const cpu = createZ80({ bus });
        step(cpu); // LD IXH,7F
        step(cpu); // INC IXH
        expect((cpu.getState().ix >>> 8) & 0xff).toBe(0x80);
        let f = cpu.getState().f;
        expect((f & 0x80) !== 0).toBe(true); // S
        expect((f & 0x04) !== 0).toBe(true); // PV (overflow 7F->80)
        step(cpu); // LD IY,0x8000
        step(cpu); // DEC IYL (00 -> FF)
        expect(cpu.getState().iy & 0xff).toBe(0xff);
        f = cpu.getState().f;
        expect((f & 0x02) !== 0).toBe(true); // N set
    });
});
//# sourceMappingURL=z80_ixiy_8bit_regs.test.js.map