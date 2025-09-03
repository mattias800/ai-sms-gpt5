import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Additional DD/FD register mapping coverage', (): void => {
  it('DD 66 d => LD IXH,(IX+d)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DD 66 00 (LD H,(IX+0))
    mem.set([0xdd, 0x66, 0x00], 0x0000);
    const cpu = createZ80({ bus });
    // IX=0x1234; mem[0x1234] = 0xA5
    const st = cpu.getState();
    mem[0x1234] = 0xa5;
    cpu.setState({ ...st, ix: 0x1234 });
    const c = step(cpu);
    expect(c).toBe(19);
    // IXH updated to 0xA5 => IX becomes 0xA534
    expect((cpu.getState().ix >>> 8) & 0xff).toBe(0xa5);
    expect(cpu.getState().ix & 0xff).toBe(0x34);
  });

  it('DD 75 d => LD (IX+d),IXL', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DD 2E 99 (LD L,0x99 => IXL); DD 75 01 (LD (IX+1),L)
    mem.set([0xdd, 0x2e, 0x99, 0xdd, 0x75, 0x01], 0x0000);
    const cpu = createZ80({ bus });
    // Set IX=0x2000
    const st = cpu.getState();
    cpu.setState({ ...st, ix: 0x2000 });
    // LD IXL,99
    step(cpu);
    // Verify IXL set
    expect(cpu.getState().ix & 0xff).toBe(0x99);
    // Now store IXL to (IX+1)
    const c = step(cpu);
    expect(c).toBe(19);
    // IX low is now 0x99, so (IX+1) == 0x2000+0x99+1 = 0x209A
    expect(mem[0x209a]).toBe(0x99);
  });

  it('DD 04/05 => INC/DEC B still work (4 cycles)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DD 04 ; DD 05
    mem.set([0xdd, 0x04, 0xdd, 0x05], 0x0000);
    const cpu = createZ80({ bus });
    let st = cpu.getState();
    cpu.setState({ ...st, b: 0x10 });
    let c = step(cpu);
    expect(c).toBe(4);
    st = cpu.getState();
    expect(st.b).toBe(0x11);
    c = step(cpu);
    expect(c).toBe(4);
    st = cpu.getState();
    expect(st.b).toBe(0x10);
  });
});

