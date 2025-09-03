import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 additional opcodes: 16-bit ops, EX/stack, LD (nn),A/A,(nn), IO, IX/IY basics', () => {
    it('LD dd,nn and INC/DEC dd and ADD HL,ss', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD BC,1234; LD DE,5678; LD HL,9ABC; LD SP,FFF0; ADD HL,BC
        mem.set([0x01, 0x34, 0x12, 0x11, 0x78, 0x56, 0x21, 0xbc, 0x9a, 0x31, 0xf0, 0xff, 0x09], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(11);
        const st = cpu.getState();
        expect(((st.h << 8) | st.l) & 0xffff).toBe((0x9abc + 0x1234) & 0xffff);
        // INC BC; DEC DE
        mem.set([0x03, 0x1b], 0x0100);
        cpu.setState({ ...st, pc: 0x0100 });
        c = step(cpu);
        expect(c).toBe(6);
        c = step(cpu);
        expect(c).toBe(6);
    });
    it('LD (nn),HL and LD HL,(nn)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Set HL=0x1234; LD (4000),HL; LD HL,(4000)
        mem.set([0x21, 0x34, 0x12, 0x22, 0x00, 0x40, 0x2a, 0x00, 0x40], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(16);
        expect(mem[0x4000]).toBe(0x34);
        expect(mem[0x4001]).toBe(0x12);
        // Overwrite memory to new value and load back
        mem[0x4000] = 0x78;
        mem[0x4001] = 0x56;
        c = step(cpu);
        expect(c).toBe(16);
        const st = cpu.getState();
        expect(st.h).toBe(0x56);
        expect(st.l).toBe(0x78);
    });
    it('LD (nn),A and LD A,(nn); LD (BC/DE),A and A,(BC/DE)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD A,0x5A; LD (4002),A; LD A,0; LD A,(4002)
        mem.set([0x3e, 0x5a, 0x32, 0x02, 0x40, 0x3e, 0x00, 0x3a, 0x02, 0x40], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(7);
        c = step(cpu);
        expect(c).toBe(13);
        expect(mem[0x4002]).toBe(0x5a);
        c = step(cpu);
        expect(c).toBe(7);
        c = step(cpu);
        expect(c).toBe(13);
        expect(cpu.getState().a).toBe(0x5a);
        // LD (BC),A and LD A,(BC)
        mem.set([0x01, 0x00, 0x50, 0x3e, 0xaa, 0x02, 0x0a], 0x0100);
        cpu.setState({ ...cpu.getState(), pc: 0x0100 });
        c = step(cpu); // LD BC,5000
        c = step(cpu); // LD A,0xAA
        c = step(cpu);
        expect(c).toBe(7); // (BC),A
        expect(mem[0x5000]).toBe(0xaa);
        c = step(cpu);
        expect(c).toBe(7);
        expect(cpu.getState().a).toBe(0xaa);
    });
    it('PUSH/POP AF and EX DE,HL and EX (SP),HL', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD SP,0x9000; LD A,0x12; LD B,0x34; EX DE,HL; PUSH AF; LD A,0; POP AF
        mem.set([0x31, 0x00, 0x90, 0x3e, 0x12, 0x06, 0x34, 0xeb, 0xf5, 0x3e, 0x00, 0xf1], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(7);
        c = step(cpu);
        expect(c).toBe(7);
        c = step(cpu);
        expect(c).toBe(4);
        c = step(cpu);
        expect(c).toBe(11);
        c = step(cpu);
        expect(c).toBe(7);
        c = step(cpu);
        expect(c).toBe(10);
        expect(cpu.getState().a).toBe(0x12);
        // EX (SP),HL
        mem.set([0x21, 0x78, 0x56, 0xe3], 0x0100);
        cpu.setState({ ...cpu.getState(), pc: 0x0100 });
        mem[0x9000] = 0x34;
        mem[0x9001] = 0x12;
        c = step(cpu);
        expect(c).toBe(10);
        c = step(cpu);
        expect(c).toBe(19);
        const st = cpu.getState();
        expect(st.h).toBe(0x12);
        expect(st.l).toBe(0x34);
        expect(mem[0x9000]).toBe(0x78);
        expect(mem[0x9001]).toBe(0x56);
    });
    it('IN A,(n) sets A and flags; OUT (n),A writes', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xdb, 0x7f, 0xd3, 0x7f], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(11);
        const a1 = cpu.getState().a; // SimpleBus returns 0xFF
        expect(a1).toBe(0xff);
        c = step(cpu);
        expect(c).toBe(11);
    });
    it('DD: LD IX,nn and LD SP,IX and EX (SP),IX and ADC A,(IX+d)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xdd, 0x21, 0x00, 0x90, 0xdd, 0xf9, 0xdd, 0x21, 0x34, 0x12, 0x21, 0x78, 0x56, 0xdd, 0xe3, 0xdd, 0x21, 0x00, 0x30, 0xdd, 0x8e, 0x04], 0x0000);
        const cpu = createZ80({ bus });
        // LD IX,9000
        let c = step(cpu);
        expect(c).toBe(14);
        // LD SP,IX
        c = step(cpu);
        expect(c).toBe(10);
        // LD IX,0x1234
        c = step(cpu);
        expect(c).toBe(14);
        // LD HL,0x5678
        c = step(cpu);
        expect(c).toBe(10);
        // EX (SP),IX
        c = step(cpu);
        expect(c).toBe(23);
        // Put 0x01 at 0x3004 and ADC A,(IX+4)
        c = step(cpu);
        expect(c).toBe(14);
        mem[0x3004] = 0x01;
        c = step(cpu);
        expect(c).toBe(19);
        expect(cpu.getState().a).toBe(0x01);
    });
});
//# sourceMappingURL=z80_more_opcodes.test.js.map