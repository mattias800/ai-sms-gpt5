import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';
const romWith = (bytes) => {
    const rom = new Uint8Array(0x4000 * 3);
    rom.set(bytes, 0x0000);
    return { rom };
};
describe('Machine SMS wait-state model', () => {
    it('adds VDP IO write penalty to OUT (n),A for port 0xBE', () => {
        // Program: OUT (0xBE),A ; NOP
        const cart = romWith([0xd3, 0xbe, 0x00]);
        const mach = createMachine({ cart, wait: { smsModel: true, includeWaitInCycles: true, vdpPenalty: 4 } });
        const cpu = mach.getCPU();
        const c = cpu.stepOne().cycles; // OUT immediate
        expect(c).toBe(11 + 4);
    });
    it('adds VDP IO read penalty to IN A,(n) for port 0xBF', () => {
        // Program: IN A,(0xBF) ; NOP
        const cart = romWith([0xdb, 0xbf, 0x00]);
        const mach = createMachine({ cart, wait: { smsModel: true, includeWaitInCycles: true, vdpPenalty: 4 } });
        const cpu = mach.getCPU();
        const c = cpu.stepOne().cycles; // IN immediate
        expect(c).toBe(11 + 4);
    });
    it('does not penalize PSG port 0x7F', () => {
        // Program: OUT (0x7F),A ; NOP
        const cart = romWith([0xd3, 0x7f, 0x00]);
        const mach = createMachine({ cart, wait: { smsModel: true, includeWaitInCycles: true, vdpPenalty: 4 } });
        const cpu = mach.getCPU();
        const c = cpu.stepOne().cycles;
        expect(c).toBe(11);
    });
});
//# sourceMappingURL=wait_states_sms_model.test.js.map