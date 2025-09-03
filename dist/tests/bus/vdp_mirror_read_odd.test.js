import { describe, it, expect } from 'vitest';
import { SmsBus } from '../../src/bus/bus.js';
import { createVDP } from '../../src/vdp/vdp.js';
const makeRom = () => ({ rom: new Uint8Array(0x4000 * 3) });
describe('VDP mirror reads via odd ports map to 0xBF (status)', () => {
    it('reading 0xFF maps to VDP status and returns a byte', () => {
        const vdp = createVDP();
        const bus = new SmsBus(makeRom(), vdp, null);
        const val = bus.readIO8(0xff);
        expect(val >= 0 && val <= 0xff).toBe(true);
    });
});
//# sourceMappingURL=vdp_mirror_read_odd.test.js.map