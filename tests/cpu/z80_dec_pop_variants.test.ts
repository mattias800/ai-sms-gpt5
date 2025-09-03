import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 additional DEC dd branches and POP qq variants', (): void => {
  it('DEC HL and DEC SP update correctly (6 cycles)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x1000; DEC HL; LD SP,0x2000; DEC SP
    mem.set([0x21, 0x00, 0x10, 0x2b, 0x31, 0x00, 0x20, 0x3b], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu); // LD HL
    let c = step(cpu);
    expect(c).toBe(6);
    let st = cpu.getState();
    expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0fff);
    step(cpu); // LD SP
    c = step(cpu);
    expect(c).toBe(6);
    st = cpu.getState();
    expect(st.sp).toBe(0x1fff);
  });

  it('POP BC/DE/HL read from stack and update SP', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // POP BC; POP DE; POP HL
    mem.set([0xc1, 0xd1, 0xe1], 0x0000);
    const cpu = createZ80({ bus });
    // Prepare stack
    let st = cpu.getState();
    cpu.setState({ ...st, sp: 0x9000 });
    mem[0x9000] = 0x34;
    mem[0x9001] = 0x12;
    mem[0x9002] = 0x78;
    mem[0x9003] = 0x56;
    mem[0x9004] = 0xbc;
    mem[0x9005] = 0x9a;

    let c = step(cpu);
    expect(c).toBe(10); // POP BC
    st = cpu.getState();
    expect(st.b).toBe(0x12);
    expect(st.c).toBe(0x34);
    expect(st.sp).toBe(0x9002);

    c = step(cpu);
    expect(c).toBe(10); // POP DE
    st = cpu.getState();
    expect(st.d).toBe(0x56);
    expect(st.e).toBe(0x78);
    expect(st.sp).toBe(0x9004);

    c = step(cpu);
    expect(c).toBe(10); // POP HL
    st = cpu.getState();
    expect(st.h).toBe(0x9a);
    expect(st.l).toBe(0xbc);
    expect(st.sp).toBe(0x9006);
  });
});
