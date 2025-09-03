import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 timing: ED and DD/FD indexed instructions', () => {
    it('ED ADC HL,ss all variants are 15 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Sequence: ED 4A ; ED 5A ; ED 6A ; ED 7A
        mem.set([0xed, 0x4a, 0xed, 0x5a, 0xed, 0x6a, 0xed, 0x7a], 0x0000);
        const cpu = createZ80({ bus });
        // Run four steps and assert each
        let c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
    });
    it('ED SBC HL,ss all variants are 15 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Sequence: ED 42 ; ED 52 ; ED 62 ; ED 72
        mem.set([0xed, 0x42, 0xed, 0x52, 0xed, 0x62, 0xed, 0x72], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
    });
    it('DD/FD ADD IX/IY,pp are 15 cycles', () => {
        // Test DD: ADD IX,BC (DD 09) and ADD IX,SP (DD 39)
        let bus = new SimpleBus();
        let mem = bus.getMemory();
        mem.set([0xdd, 0x09, 0xdd, 0x39], 0x0000);
        let cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
        // Test FD: ADD IY,DE (FD 19) and ADD IY,IY (FD 29)
        bus = new SimpleBus();
        mem = bus.getMemory();
        mem.set([0xfd, 0x19, 0xfd, 0x29], 0x0000);
        cpu = createZ80({ bus });
        c = step(cpu);
        expect(c).toBe(15);
        c = step(cpu);
        expect(c).toBe(15);
    });
    it('JP (IX/IY) take 8 cycles', () => {
        // JP (IX)
        let bus = new SimpleBus();
        let mem = bus.getMemory();
        mem.set([0xdd, 0xe9], 0x0000);
        let cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(8);
        // JP (IY)
        bus = new SimpleBus();
        mem = bus.getMemory();
        mem.set([0xfd, 0xe9], 0x0000);
        cpu = createZ80({ bus });
        c = step(cpu);
        expect(c).toBe(8);
    });
    it('LD (IX+d),n and LD A,(IX+d) and LD (IX+d),A take 19 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // Program: DD 36 01 77 ; DD 7E 02 ; DD 77 03
        mem.set([0xdd, 0x36, 0x01, 0x77, 0xdd, 0x7e, 0x02, 0xdd, 0x77, 0x03], 0x0000);
        const cpu = createZ80({ bus });
        let c = step(cpu);
        expect(c).toBe(19); // LD (IX+1),0x77
        c = step(cpu);
        expect(c).toBe(19); // LD A,(IX+2)
        c = step(cpu);
        expect(c).toBe(19); // LD (IX+3),A
    });
    it('ALU (IX+d) forms (ADC/CP) are 19 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // ADC A,(IX+0) ; CP (IX+5)
        mem.set([0xdd, 0x8e, 0x00, 0xdd, 0xbe, 0x05], 0x0000);
        const cpu = createZ80({ bus });
        // Seed IX and memory values
        let st = cpu.getState();
        cpu.setState({ ...st, ix: 0x4000, a: 0x10 });
        mem[0x4000] = 0x02; // (IX+0)
        mem[0x4005] = 0x20; // (IX+5)
        let c = step(cpu);
        expect(c).toBe(19);
        c = step(cpu);
        expect(c).toBe(19);
    });
    it('LD r,(IX+d) and LD (IX+d),r are each 19 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // LD B,(IX+0) ; LD (IX+1),C
        mem.set([0xdd, 0x46, 0x00, 0xdd, 0x71, 0x01], 0x0000);
        const cpu = createZ80({ bus });
        let st = cpu.getState();
        cpu.setState({ ...st, ix: 0x2000, c: 0x55 });
        mem[0x2000] = 0xaa;
        let c = step(cpu);
        expect(c).toBe(19); // LD B,(IX+0)
        c = step(cpu);
        expect(c).toBe(19); // LD (IX+1),C
    });
    it('EX (SP),IX/IY are 23 cycles', () => {
        // EX (SP),IX
        let bus = new SimpleBus();
        let mem = bus.getMemory();
        mem.set([0xdd, 0xe3], 0x0000);
        let cpu = createZ80({ bus });
        let st = cpu.getState();
        cpu.setState({ ...st, sp: 0x8000, ix: 0x1234 });
        mem[0x8000] = 0x78;
        mem[0x8001] = 0x56;
        let c = step(cpu);
        expect(c).toBe(23);
        // EX (SP),IY
        bus = new SimpleBus();
        mem = bus.getMemory();
        mem.set([0xfd, 0xe3], 0x0000);
        cpu = createZ80({ bus });
        st = cpu.getState();
        cpu.setState({ ...st, sp: 0x8000, iy: 0xabcd });
        mem[0x8000] = 0x34;
        mem[0x8001] = 0x12;
        c = step(cpu);
        expect(c).toBe(23);
    });
});
//# sourceMappingURL=z80_timing_indexed_ed.test.js.map