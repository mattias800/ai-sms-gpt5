import { describe, it, expect } from 'vitest';
import { createMachine } from '../../src/machine/machine.js';
const makeRom = (bytes) => {
    const rom = new Uint8Array(0x4000 * 3);
    rom.set(bytes, 0x0000);
    return rom;
};
describe('Scheduler/Machine vblank IRQ integration', () => {
    it('after one NTSC frame worth of cycles, vblank IRQ vectors CPU (EI+HALT)', () => {
        // Program: EI; HALT; (rest NOPs)
        const rom = makeRom([0xfb, 0x76]);
        const cart = { rom };
        const mach = createMachine({ cart });
        // Enable VBlank IRQ on VDP (reg1 bit5)
        const vdp = mach.getVDP();
        vdp.writePort(0xbf, 0x20);
        vdp.writePort(0xbf, 0x80 | 0x01);
        // Run until vblank start
        mach.runCycles(192 * 228);
        // Next step should accept IRQ and vector
        mach.runCycles(1);
        const st = mach.getCPU().getState();
        expect(st.pc).toBe(0x0038);
        expect(st.halted).toBe(false);
    });
});
//# sourceMappingURL=vblank_irq.test.js.map