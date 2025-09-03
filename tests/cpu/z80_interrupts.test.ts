import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 interrupts (IM1, NMI, EI/DI, HALT)', (): void => {
  it('EI delay: IRQ accepted only after next instruction; IM1 vector 0x0038 and HALT wakes', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: EI; NOP; HALT; (then we expect IRQ to vector)
    mem.set([0xfb, 0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // Execute EI
    expect(step(cpu)).toBe(4);
    // Request IRQ immediately
    cpu.requestIRQ();
    // Next instruction should run normally due to EI delay
    expect(step(cpu)).toBe(4); // NOP executes

    // Now HALT
    expect(step(cpu)).toBe(4);
    // CPU is halted
    expect(cpu.getState().halted).toBe(true);

    // Next step should accept IRQ, wake from HALT, push PC (which is 0x0003) and jump to 0x0038
    const cycles = step(cpu);
    expect(cycles).toBe(13);
    const st = cpu.getState();
    expect(st.halted).toBe(false);
    expect(st.pc).toBe(0x0038);
    // Check stack contains return address 0x0003 (hi then lo at [SP], [SP+1])
    const sp = st.sp;
    expect(mem[sp]).toBe(0x03); // lo
    expect(mem[(sp + 1) & 0xffff]).toBe(0x00); // hi
  });

  it('DI prevents IRQ; EI enables after next instruction', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: DI; NOP; EI; NOP; HALT
    mem.set([0xf3, 0x00, 0xfb, 0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    // DI
    step(cpu);
    cpu.requestIRQ();
    // NOP: still disabled (DI), should not accept
    step(cpu);
    // EI
    step(cpu);
    // Request another IRQ immediately; NOP executes due to EI delay
    cpu.requestIRQ();
    step(cpu);
    // HALT
    step(cpu);
    // Next step accepts IRQ now
    const c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0038);
  });

  it('NMI vector 0x0066 and 11 cycles, wins over maskable IRQ', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP; HALT
    mem.set([0x00, 0x76], 0x0000);
    const cpu = createZ80({ bus });

    step(cpu); // NOP
    cpu.requestIRQ();
    cpu.requestNMI();
    const c = step(cpu);
    expect(c).toBe(11);
    expect(cpu.getState().pc).toBe(0x0066);
  });
});
