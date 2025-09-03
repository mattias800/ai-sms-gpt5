import { describe, it, expect } from 'vitest';
import { createVDP } from '../../src/vdp/vdp.js';
import { SmsBus } from '../../src/bus/bus.js';
const cartFromBanks = (banks) => {
    const rom = new Uint8Array(banks * 0x4000);
    for (let i = 0; i < banks; i++)
        rom[i * 0x4000] = i; // sentinel at first byte of each bank
    return { rom };
};
describe('SMS Bus memory map and SegaMapper', () => {
    it('WRAM read/write and mirror 0xE000-0xFFFF', () => {
        const vdp = createVDP();
        const bus = new SmsBus(cartFromBanks(4), vdp);
        bus.write8(0xc000, 0x12);
        bus.write8(0xdfff, 0x34);
        expect(bus.read8(0xc000)).toBe(0x12);
        expect(bus.read8(0xdfff)).toBe(0x34);
        // Mirror
        expect(bus.read8(0xe000)).toBe(0x12);
        expect(bus.read8(0xffff)).toBe(0x34);
    });
    it('ROM banks and control writes at 0xFFFC-0xFFFE', () => {
        const vdp = createVDP();
        const bus = new SmsBus(cartFromBanks(8), vdp);
        // Initially bank0=0, bank1=1, bank2=2; check sentinel bytes
        expect(bus.read8(0x0000)).toBe(0); // bank0
        expect(bus.read8(0x4000)).toBe(1); // bank1
        expect(bus.read8(0x8000)).toBe(2); // bank2
        // Switch bank2 to 5
        bus.write8(0xfffe, 5);
        expect(bus.read8(0x8000)).toBe(5);
        // Switch bank1 to 6
        bus.write8(0xfffd, 6);
        expect(bus.read8(0x4000)).toBe(6);
        // Switch bank0 to 7
        bus.write8(0xfffc, 7);
        expect(bus.read8(0x0000)).toBe(7);
    });
    it('VDP port mirrors on IO space (0xBE/0xBF)', () => {
        const vdp = createVDP();
        const bus = new SmsBus(cartFromBanks(4), vdp);
        // Set VRAM address 0x0002 for write: control sequence low, high (code=1 for write)
        bus.writeIO8(0xbf, 0x02);
        bus.writeIO8(0xbf, 0x40); // 01 << 6 | addr high bits 0
        // Write three bytes via data port mirrors
        bus.writeIO8(0xbe, 0x11);
        bus.writeIO8(0xfe, 0x22); // mirror (even, low6=0x3e)
        bus.writeIO8(0x7e, 0x33);
        // Read back using buffered read: first read returns previous buffer (0)
        bus.writeIO8(0xbf, 0x02);
        bus.writeIO8(0xbf, 0x00); // code 0 read
        expect(bus.readIO8(0xbe)).toBe(0x00); // buffered
        expect(bus.readIO8(0xbe)).toBe(0x11);
        expect(bus.readIO8(0xbe)).toBe(0x22);
        expect(bus.readIO8(0xbe)).toBe(0x33);
    });
    it('PSG write on 0x7f is handled and not shadowed by VDP mirror', () => {
        const vdp = createVDP();
        const bus = new SmsBus(cartFromBanks(1), vdp);
        bus.writeIO8(0x7f, 0x99);
        expect(bus.getLastPSG()).toBe(0x99);
    });
});
//# sourceMappingURL=memory_map.test.js.map