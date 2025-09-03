import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IM2 interrupts', (): void => {
  it('IM2 uses vector table entry and takes 19 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x40; LD I,A; IM 2; EI; NOP; HALT
    mem.set([0x3e, 0x40, 0xed, 0x47, 0xed, 0x5e, 0xfb, 0x00, 0x76], 0x0000);

    // Vector table at 0x40A2 points to 0x1234 (lo=0x34, hi=0x12)
    mem[0x40a2] = 0x34;
    mem[0x40a3] = 0x12;

    const cpu = createZ80({ bus });
    // Provide external vector byte 0xA2 on the data bus for IM2 acceptance
    cpu.setIM2Vector(0xa2);

    // Execute: LD A,0x40; LD I,A; IM2; EI
    step(cpu);
    step(cpu);
    step(cpu);
    step(cpu);

    // Request IRQ and run through NOP (EI delay)
    cpu.requestIRQ();
    expect(step(cpu)).toBe(4); // NOP

    // HALT to allow interrupt to be taken on next step
    expect(step(cpu)).toBe(4); // HALT

    // Next step should accept IRQ in IM2
    const cycles = step(cpu);
    expect(cycles).toBe(19);
    expect(cpu.getState().pc).toBe(0x1234);
  });

  it('IM2 defaults to vector 0xFF when not set', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x40; LD I,A; IM 2; EI; NOP; HALT
    mem.set([0x3e, 0x40, 0xed, 0x47, 0xed, 0x5e, 0xfb, 0x00, 0x76], 0x0000);

    // Default vector 0xFF -> pointer at 0x40FF
    mem[0x40ff] = 0x56; // lo
    mem[0x4100] = 0x34; // hi (0x3456)

    const cpu = createZ80({ bus });

    step(cpu); // LD A,0x40
    step(cpu); // LD I,A
    step(cpu); // IM2
    step(cpu); // EI

    cpu.requestIRQ();
    expect(step(cpu)).toBe(4); // NOP (EI delay)
    expect(step(cpu)).toBe(4); // HALT

    const cycles = step(cpu);
    expect(cycles).toBe(19);
    expect(cpu.getState().pc).toBe(0x3456);
  });

  it('IM2 IRQ pushes return address on stack and clears IFF1', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: LD A,0x40; LD I,A; IM 2; EI; NOP; HALT
    mem.set([0x3e, 0x40, 0xed, 0x47, 0xed, 0x5e, 0xfb, 0x00, 0x76], 0x0000);
    // Vector pointer
    mem[0x40ff] = 0x00;
    mem[0x4100] = 0x10; // jump to 0x1000 to avoid overlapping program
    const cpu = createZ80({ bus });

    // Execute setup
    step(cpu); // LD A,0x40
    step(cpu); // LD I,A
    step(cpu); // IM2
    step(cpu); // EI

    // Request IRQ, pass NOP, then HALT to enable EI commit
    cpu.requestIRQ();
    step(cpu); // NOP
    step(cpu); // HALT

    const before = cpu.getState();
    const c = step(cpu); // accept IM2 IRQ
    expect(c).toBe(19);
    const after = cpu.getState();
    // After acceptance, SP decreased by 2; mem[SP] holds low byte of return address, mem[SP+1] high
    // Return address should be the PC after HALT (which is 0x0009 given program length up to HALT)
    const sp = after.sp & 0xffff;
    expect(mem[sp]).toBe(0x09);
    expect(mem[(sp + 1) & 0xffff]).toBe(0x00);
    // IFF1 cleared
    expect(after.iff1).toBe(false);
    // PC set to vector target
    expect(after.pc).toBe(0x1000);
    // SP indeed decreased by 2 relative to before
    expect(sp).toBe((before.sp - 2) & 0xffff);
  });
});
