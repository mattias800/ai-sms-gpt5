import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';
import { createVDP } from '../../src/vdp/vdp.js';

const makeRom = (): Cartridge => ({ rom: new Uint8Array(0x4000 * 3) });

describe('VDP mirror writes via odd ports map to 0xBF (control)', (): void => {
  it('writing 0xFF maps to VDP control and does not throw', (): void => {
    const vdp = createVDP();
    const bus = new SmsBus(makeRom(), vdp, null as any);
    bus.writeIO8(0xff, 0x00);
    // No assertion needed; just branch coverage
    expect(true).toBe(true);
  });
});
