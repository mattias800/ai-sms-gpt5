import { describe, it, expect } from 'vitest';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { SimpleBus } from '../../src/bus/bus.js';

const FLAG_Z = 0x40;
const FLAG_N = 0x02;

describe('Z80 CP n immediate basic behavior', (): void => {
  it('CP n sets Z when A == n and preserves A', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // 0000: LD A,0xFE ; 0002: CP 0xFE
    mem[0x0000] = 0x3e; // LD A,n
    mem[0x0001] = 0xfe;
    mem[0x0002] = 0xfe; // CP n
    mem[0x0003] = 0xfe;

    const cpu = createZ80({ bus });
    // Step LD A,0xFE
    cpu.stepOne();
    // Step CP 0xFE
    cpu.stepOne();
    const st = cpu.getState();
    expect(st.a & 0xff).toBe(0xfe);
    expect(st.f & FLAG_Z).toBe(FLAG_Z);
    expect(st.f & FLAG_N).toBe(FLAG_N);
  });
});

