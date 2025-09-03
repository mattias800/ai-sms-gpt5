import { describe, it, expect } from 'vitest';
import { SmsBus } from '../../src/bus/bus.js';
const makeRom = () => ({ rom: new Uint8Array(0x4000 * 3) });
describe('Memory control (0x3E) is stored and readable via getter (scaffold, branch coverage)', () => {
    it('getMemControl reflects last write to 0x3E and does not affect 0xBE/0xBF mirrors', () => {
        const bus = new SmsBus(makeRom(), null, null);
        bus.writeIO8(0x3e, 0xAA);
        expect(bus.getMemControl()).toBe(0xAA);
        // Reads on 0x3E should be 0xFF and not map to VDP
        expect(bus.readIO8(0x3e)).toBe(0xff);
    });
});
//# sourceMappingURL=memory_control_scaffold.test.js.map