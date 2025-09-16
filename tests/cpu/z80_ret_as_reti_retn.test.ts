import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 RET used inside interrupt service restores IFF1 from IFF2', (): void => {
  it('RET in IM1 ISR restores IFF1 when returning to original PC (compat final-return restore)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at reset: EI; NOP; (PC will be 0x0002)
    mem.set([0xfb, 0x00], 0x0000);
    // IM1 vector at 0x0038 contains a plain RET (not RETI)
    mem[0x0038] = 0xc9;

    const cpu = createZ80({ bus });

    // Execute EI (4 cycles)
    step(cpu);
    // Execute NOP to commit EI: IFF1/2 become true after this instruction
    step(cpu);

    let st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0002);
    expect(st.iff1).toBe(true);
    expect(st.iff2).toBe(true);

    // Request a maskable IRQ and step once to accept it (IM1 -> 0x0038)
    cpu.requestIRQ();
    step(cpu);
    st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0038);
    expect(st.iff1).toBe(false); // IFF1 cleared on IRQ accept

    // Execute RET at 0x0038; compat: since this RET returns to the original PC pushed at IRQ accept,
    // restore IFF1 := IFF2 (final-return restore).
    step(cpu);
    st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0002);
    expect(st.iff1).toBe(true);
    expect(st.iff2).toBe(true);

    // Now place EI; NOP at 0x0002 onward to re-enable interrupts properly
    mem[0x0002] = 0xfb; // EI
    mem[0x0003] = 0x00; // NOP to commit EI

    // Execute EI and ensure it only commits after the following instruction
    step(cpu); // EI
    // After our compat final-return restore, IFF1 is already true; EI keeps it pending-true semantics but state remains true
    expect(cpu.getState().iff1).toBe(true);
    step(cpu); // NOP (commit EI)
    expect(cpu.getState().iff1).toBe(true);
  });

  it('RET in NMI ISR restores IFF1 when returning to original PC (compat final-return restore)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Put RET at NMI vector 0x0066
    mem[0x0066] = 0xc9;

    const cpu = createZ80({ bus });

    // Seed IFF2=true to represent the pre-NMI IFF1 state we want to restore
    const s0 = cpu.getState();
    cpu.setState({ ...s0, iff1: true, iff2: true });

    // Request NMI and accept it
    cpu.requestNMI();
    step(cpu);
    let st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0066);
    // On NMI accept, IFF1 is reset; we only restore on RET/RETN
    expect(st.iff1).toBe(false);

    // Execute RET (not RETN) in NMI handler; compat: final-return restore applies
    step(cpu);
    st = cpu.getState();
    expect(st.iff1).toBe(true);

    // Now also check explicit RETN restores too
    // Reset to state so that NMI will fire again and vector to an ED 45 (RETN)
    // Place RETN at 0x0066
    mem[0x0066] = 0xed;
    mem[0x0067] = 0x45;
    const s1 = cpu.getState();
    cpu.setState({ ...s1, pc: 0x0000, iff1: true, iff2: true });
    cpu.requestNMI();
    step(cpu);
    st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0066);
    expect(st.iff1).toBe(false);
    step(cpu); // RETN
    st = cpu.getState();
    expect(st.iff1).toBe(true);
  });
});

