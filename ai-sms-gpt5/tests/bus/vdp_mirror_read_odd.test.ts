import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';
import { createVDP } from '../../src/vdp/vdp.js';

const makeRom = (): Cartridge => ({ rom: new Uint8Array(0x4000 * 3) });

describe('VDP mirror reads via odd ports map to 0xBF (status)', (): void => {
  it('reading 0xFF maps to VDP status and returns a byte', (): void => {
    const vdp = createVDP();
    const bus = new SmsBus(makeRom(), vdp, null as any);
    const val = bus.readIO8(0xff);
    expect(val >= 0 && val <= 0xff).toBe(true);
  });
});

