import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 IM0 edge cases', (): void => {
  it('EI-delayed acceptance with multi-byte instruction (JP nn): IRQ accepted only after the next instruction completes', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program @0000: IM 0; EI; JP 0010h
    // Program @0010: HALT
    mem.set([0xed, 0x46, 0xfb, 0xc3, 0x10, 0x00], 0x0000);
    mem.set([0x76], 0x0010);
    const cpu = createZ80({ bus });

    // Execute IM0 and EI
    expect(step(cpu)).toBeTypeOf('number');
    expect(step(cpu)).toBe(4);

    // Request IRQ before the multi-byte JP executes
    cpu.requestIRQ();

    // Execute JP nn (should not accept IRQ during this instruction)
    const c1 = step(cpu);
    expect(c1).toBe(10);
    expect(cpu.getState().pc).toBe(0x0010);

    // Execute HALT at 0010 (still not accepted yet)
    const c2 = step(cpu);
    expect(c2).toBe(4);

    const before = cpu.getState();
    // Next step should accept IM0, push return address (0011) and jump to 0038h
    const c3 = step(cpu);
    expect(c3).toBe(13);
    const after = cpu.getState();
    expect(after.pc).toBe(0x0038);
    // Verify return address pushed (lo @ [SP], hi @ [SP+1]) equals 0x0011
    const sp = after.sp & 0xffff;
    expect(mem[sp]).toBe(0x11);
    expect(mem[(sp + 1) & 0xffff]).toBe(0x00);
    expect(sp).toBe((before.sp - 2) & 0xffff);
    expect(after.iff1).toBe(false);
  });

  it('Back-to-back IRQs: second IRQ not accepted until EI re-enables interrupts', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Main @0000: IM 0; EI; NOP; HALT
    mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
    // Handler @0038: NOP; EI; HALT
    mem.set([0x00, 0xfb, 0x76], 0x0038);

    const cpu = createZ80({ bus });

    // Set IM0 and EI
    step(cpu); // IM0
    step(cpu); // EI

    // First IRQ
    cpu.requestIRQ();
    step(cpu); // NOP (EI delay)
    step(cpu); // HALT
    let c = step(cpu); // Accept IM0
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0038);
    expect(cpu.getState().iff1).toBe(false);

    // Post a second IRQ; should not be accepted until EI executes
    cpu.requestIRQ();

    // Execute NOP at 0038 (no acceptance, iff1=false)
    c = step(cpu);
    expect(c).toBe(4);
    expect(cpu.getState().pc).toBe(0x0039);

    // Execute EI at 0039; interrupts become enabled after next instruction
    c = step(cpu);
    expect(c).toBe(4);
    expect(cpu.getState().pc).toBe(0x003a);

    // Execute HALT at 003A
    c = step(cpu);
    expect(c).toBe(4);

    // Next step should accept second IRQ
    c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0038);
  });

  it('Injected IM0 opcode persists across multiple interrupts (e.g., RST 08h twice)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Main @0000: IM 0; EI; NOP; HALT
    mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);
    // RST 08h handler @0008: EI; HALT
    mem.set([0xfb, 0x76], 0x0008);

    const cpu = createZ80({ bus });
    cpu.setIM0Opcode(0xcf); // RST 08h

    // Enable IM0 and EI
    step(cpu); // IM0
    step(cpu); // EI

    // First IRQ
    cpu.requestIRQ();
    step(cpu); // NOP
    step(cpu); // HALT
    let c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0008);

    // Second IRQ; should still route to 0008 due to persistent opcode
    cpu.requestIRQ();
    step(cpu); // EI at 0008
    step(cpu); // HALT
    c = step(cpu); // accept again
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0008);
  });

  it('Injected opcode takes precedence over configured IM0 vector', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Main @0000: IM 0; EI; NOP; HALT
    mem.set([0xed, 0x46, 0xfb, 0x00, 0x76], 0x0000);

    const cpu = createZ80({ bus });
    cpu.setIM0Vector(0x0028);
    cpu.setIM0Opcode(0xe7); // RST 20h

    // Enable IM0 and EI
    step(cpu); // IM0
    step(cpu); // EI

    cpu.requestIRQ();
    step(cpu); // NOP
    step(cpu); // HALT
    const c = step(cpu); // accept
    expect(c).toBe(13);
    // Should jump to 0x0020 (opcode), not the configured vector 0x0028
    expect(cpu.getState().pc).toBe(0x0020);
  });
});
