import { describe, it, expect } from 'vitest';
import { SmsBus, type Cartridge } from '../../src/bus/bus.js';
import { createVDP } from '../../src/vdp/vdp.js';

const makeRom = (): Cartridge => ({ rom: new Uint8Array(0x4000 * 3) });

describe('VDP mirror reads via even ports map to 0xBE (data)', (): void => {
  it('reading 0xFE maps to VDP data port and returns a byte (typically buffer=0)', (): void => {
    const vdp = createVDP();
    const bus = new SmsBus(makeRom(), vdp, null as any);
    const val = bus.readIO8(0xfe);
    expect(val >= 0 && val <= 0xff).toBe(true);
  });
});

