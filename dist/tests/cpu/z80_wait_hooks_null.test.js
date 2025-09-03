import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
describe('Z80 wait-state hooks null path', () => {
    it('setWaitStateHooks(null) clears hooks safely', () => {
        const bus = new SimpleBus();
        const cpu = createZ80({ bus });
        // Enable hooks first
        cpu.setWaitStateHooks({
            includeWaitInCycles: false,
            onMemoryRead: (_addr) => 0,
            onMemoryWrite: (_addr) => 0,
            onIORead: (_port) => 0,
            onIOWrite: (_port) => 0,
        });
        // Clear hooks and ensure no error
        cpu.setWaitStateHooks(null);
        // Execute a simple NOP to ensure everything still works
        const mem = bus.getMemory();
        mem[0x0000] = 0x00;
        const res = cpu.stepOne();
        expect(res.cycles).toBeGreaterThanOrEqual(4);
    });
});
//# sourceMappingURL=z80_wait_hooks_null.test.js.map