import { describe, it, expect, vi } from 'vitest';
import { SmsBus } from '../../src/bus/bus.js';
const cart = (romSize) => ({ rom: new Uint8Array(romSize) });
describe('SmsBus additional coverage', () => {
    it('throws if ROM size is not a multiple of 16KB', () => {
        const bad = cart(0x4001);
        expect(() => {
            void new SmsBus(bad, null);
        }).toThrowError(/ROM size must be multiple of 16KB/);
    });
    it('readIO8(0x7f) reads VDP VCounter (not PSG)', () => {
        // VDP stub: return 0x42 when reading 0x7f; ensures bus routes to VDP
        const vdp = {
            readPort: (p) => {
                return (p & 0xff) === 0x7f ? 0x42 : 0x00;
            },
            writePort: (_p, _v) => {
                // no-op
            },
            tickCycles: (_c) => {
                // no-op
            },
            hasIRQ: () => false,
        };
        const bus = new SmsBus({ rom: new Uint8Array(0x4000 * 3) }, vdp);
        expect(bus.readIO8(0x7f)).toBe(0x42);
    });
    it('VDP mirror read maps odd/even low6=0x3F/0x3E to 0xBF/0xBE (excluding 0x3F/0x3E themselves)', () => {
        const vdp = {
            readPort: (p) => (p & 0xff) === 0xbf ? 0xab : 0xcd,
            writePort: (_p, _v) => {
                // no-op
            },
            tickCycles: (_c) => {
                // no-op
            },
            hasIRQ: () => false,
        };
        const bus = new SmsBus({ rom: new Uint8Array(0x4000 * 3) }, vdp);
        expect(bus.readIO8(0xff)).toBe(0xab); // low6=0x3f -> odd -> 0xbf (not PSG)
        expect(bus.readIO8(0xbf)).toBe(0xab); // direct
        expect(bus.readIO8(0xfe)).toBe(0xcd); // low6=0x3e -> even -> 0xbe
    });
    it('PSG write on 0x7f calls PSG.write with the value', () => {
        const psgWrite = vi.fn();
        const psg = {
            write: (v) => {
                psgWrite(v & 0xff);
            },
            tickCycles: (_c) => {
                // no-op
            },
            getState: () => {
                throw new Error('not used');
            },
        }; // getState never used
        const bus = new SmsBus({ rom: new Uint8Array(0x4000 * 3) }, null, psg);
        bus.writeIO8(0x7f, 0xa5);
        expect(psgWrite).toHaveBeenCalledTimes(1);
        expect(psgWrite).toHaveBeenCalledWith(0xa5);
    });
});
//# sourceMappingURL=bus_additional_coverage.test.js.map