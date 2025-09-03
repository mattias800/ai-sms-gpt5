import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
const step = (cpu) => cpu.stepOne().cycles;
describe('Z80 CB and DD/FD CB coverage', () => {
    it('CB SRL C (register) updates C and flags, 8 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xcb, 0x39], 0x0000); // SRL C
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        cpu.setState({ ...st, c: 0x01 });
        const c = step(cpu);
        expect(c).toBe(8);
        const s2 = cpu.getState();
        expect(s2.c).toBe(0x00);
        expect((s2.f & 0x01) !== 0).toBe(true); // C flag set
    });
    it('CB SLL (HL) modifies memory and sets carry, 15 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xcb, 0x36], 0x0010); // SLL (HL)
        mem[0x2000] = 0x80;
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        cpu.setState({ ...st, h: 0x20, l: 0x00, pc: 0x0010 });
        const c = step(cpu);
        expect(c).toBe(15);
        expect(mem[0x2000]).toBe(0x01);
        expect((cpu.getState().f & 0x01) !== 0).toBe(true); // C set
    });
    it('CB BIT 7,(HL) sets S if bit set, preserves C and sets H, 12 cycles for (HL)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xcb, 0x7e], 0x0020); // BIT 7,(HL)
        mem[0x2100] = 0x80;
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        cpu.setState({ ...st, h: 0x21, l: 0x00, pc: 0x0020, f: (st.f | 0x01) & 0xff }); // set C=1
        const c = step(cpu);
        expect(c).toBe(12);
        const f = cpu.getState().f;
        expect((f & 0x80) !== 0).toBe(true); // S set
        expect((f & 0x40) === 0).toBe(true); // Z clear
        expect((f & 0x10) !== 0).toBe(true); // H set
        expect((f & 0x01) !== 0).toBe(true); // C preserved
    });
    it('CB BIT 2,(HL) clears S, sets Z/PV when bit clear, 12 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        mem.set([0xcb, 0x56], 0x0030); // BIT 2,(HL)
        mem[0x2200] = 0x00;
        const cpu = createZ80({ bus });
        const st = cpu.getState();
        cpu.setState({ ...st, h: 0x22, l: 0x00, pc: 0x0030, f: (st.f | 0x01) & 0xff }); // C=1
        const c = step(cpu);
        expect(c).toBe(12);
        const f = cpu.getState().f;
        expect((f & 0x80) === 0).toBe(true); // S clear
        expect((f & 0x40) !== 0).toBe(true); // Z set
        expect((f & 0x04) !== 0).toBe(true); // PV set
        expect((f & 0x10) !== 0).toBe(true); // H set
        expect((f & 0x01) !== 0).toBe(true); // C preserved
    });
    it('CB RES 3,(HL) and CB SET 5,B', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // RES 3,(HL)
        mem.set([0xcb, 0x9e], 0x0040);
        mem[0x2300] = 0x08;
        const cpu = createZ80({ bus });
        let st = cpu.getState();
        cpu.setState({ ...st, h: 0x23, l: 0x00, pc: 0x0040 });
        let c = step(cpu);
        expect(c).toBe(15);
        expect(mem[0x2300]).toBe(0x00);
        // SET 5,B
        const mem2 = bus.getMemory();
        mem2.set([0xcb, 0xe8], 0x0050);
        st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0050, b: 0x00 });
        c = step(cpu);
        expect(c).toBe(8);
        expect(cpu.getState().b).toBe(0x20);
    });
    it('DD CB BIT 6,(IX+1) 20 cycles; DD CB RES 1,(IX+2),E and RL (IX+1),D 23 cycles', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // BIT 6,(IX+1)
        mem.set([0xdd, 0xcb, 0x01, 0x76], 0x0100);
        // RES 1,(IX+2),E
        mem.set([0xdd, 0xcb, 0x02, 0x8b], 0x0110);
        // RL (IX+1),D
        mem.set([0xdd, 0xcb, 0x01, 0x12], 0x0120);
        const cpu = createZ80({ bus });
        // Prepare IX and memory
        let st = cpu.getState();
        cpu.setState({ ...st, ix: 0x3000 });
        mem[0x3001] = 0x40; // bit6 set
        // BIT 6,(IX+1)
        cpu.setState({ ...cpu.getState(), pc: 0x0100, f: (cpu.getState().f | 0x01) & 0xff });
        let c = step(cpu);
        expect(c).toBe(20);
        const f = cpu.getState().f;
        expect((f & 0x40) === 0).toBe(true); // Z clear
        expect((f & 0x01) !== 0).toBe(true); // C preserved
        // RES 1,(IX+2),E
        mem[0x3002] = 0x03;
        st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0110, e: 0xff });
        c = step(cpu);
        expect(c).toBe(23);
        expect(mem[0x3002]).toBe(0x01);
        expect(cpu.getState().e).toBe(0x01);
        // RL (IX+1),D with initial C=1 and mem 0x80 -> result 0x01, carry set
        mem[0x3001] = 0x80;
        st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0120, d: 0x00, f: (st.f | 0x01) & 0xff }); // C=1
        c = step(cpu);
        expect(c).toBe(23);
        expect(mem[0x3001]).toBe(0x01);
        expect(cpu.getState().d).toBe(0x01);
        expect((cpu.getState().f & 0x01) !== 0).toBe(true); // C set
    });
    it('CB RLC B parity true (result 0x00) and CB RRC C parity false (result 0x80)', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // RLC B
        mem.set([0xcb, 0x00], 0x0200);
        // RRC C
        mem.set([0xcb, 0x09], 0x0210);
        const cpu = createZ80({ bus });
        // Set B=0x00 so RLC keeps 0, PV=1 (even parity), C=0
        let st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0200, b: 0x00 });
        let c = step(cpu);
        expect(c).toBe(8);
        let f = cpu.getState().f;
        expect(cpu.getState().b).toBe(0x00);
        expect((f & 0x04) !== 0).toBe(true); // PV set (even parity for 0)
        expect((f & 0x01) === 0).toBe(true); // C cleared
        // Now RRC C with C=0x01 -> result 0x80, PV depends on 1 bit (odd) => 0
        st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0210, c: 0x01 });
        c = step(cpu);
        expect(c).toBe(8);
        f = cpu.getState().f;
        expect(cpu.getState().c).toBe(0x80);
        expect((f & 0x04) === 0).toBe(true); // PV cleared (odd parity)
        expect((f & 0x01) !== 0).toBe(true); // C set
    });
    it('CB SLA D sets carry and clears PV for odd parity; CB SRA A preserves sign bit and sets PV for even parity', () => {
        const bus = new SimpleBus();
        const mem = bus.getMemory();
        // SLA D
        mem.set([0xcb, 0x22], 0x0300);
        // SRA A
        mem.set([0xcb, 0x2f], 0x0310);
        const cpu = createZ80({ bus });
        // SLA D with D=0xFF => result 0xFE, C=1, PV(parity of 0xFE=7 ones) -> 0
        let st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0300, d: 0xff });
        let c = step(cpu);
        expect(c).toBe(8);
        let f = cpu.getState().f;
        expect(cpu.getState().d).toBe(0xfe);
        expect((f & 0x01) !== 0).toBe(true); // C set
        expect((f & 0x04) === 0).toBe(true); // PV cleared
        // SRA A with A=0x81 => result 0xC0, C=1, S=1, PV even parity -> 1
        st = cpu.getState();
        cpu.setState({ ...st, pc: 0x0310, a: 0x81 });
        c = step(cpu);
        expect(c).toBe(8);
        f = cpu.getState().f;
        expect(cpu.getState().a).toBe(0xc0);
        expect((f & 0x01) !== 0).toBe(true); // C set
        expect((f & 0x80) !== 0).toBe(true); // S set
        expect((f & 0x04) !== 0).toBe(true); // PV set (even parity)
    });
});
//# sourceMappingURL=z80_cb_ddcb_coverage.test.js.map