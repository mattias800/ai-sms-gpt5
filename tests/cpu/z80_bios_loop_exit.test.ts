import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

const setIY = (cpu: ReturnType<typeof createZ80>, iy: number): void => {
  const st = cpu.getState();
  cpu.setState({ ...st, iy: iy & 0xffff });
};

describe('Z80 BIOS-style IY wait loop behavior around BIT 0,(IY+0) and JR Z', (): void => {
  it('When (IY+0) has bit0=1, JR Z is not taken and we fall through to HALT', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program layout at 0x0000:
    //   FD CB 00 46    BIT 0,(IY+0)
    //   28 FA          JR Z, -6   (would jump back to 0x0000 if Z==1)
    //   76             HALT
    mem.set([0xfd, 0xcb, 0x00, 0x46, 0x28, 0xfa, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    setIY(cpu, 0xd200);
    mem[0xd200] = 0x01; // bit0 set => Z should be 0 after BIT

    // Execute BIT
    let cycles = step(cpu);
    expect(cycles).toBe(20);
    // Execute JR Z (should NOT take branch)
    cycles = step(cpu);
    expect(cycles).toBe(7);
    // Next instruction should be HALT at 0x0006
    const st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0006);
    cycles = step(cpu);
    expect(cycles).toBe(4);
  });

  it('When (IY+0) has bit0=0, JR Z is taken back to 0x0000', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xfd, 0xcb, 0x00, 0x46, 0x28, 0xfa, 0x76], 0x0100);
    const cpu = createZ80({ bus });
    setIY(cpu, 0xd200);
    // Place BIT/JR at 0x0100 to avoid overlapping with prior test memory; ensure bit0=0
    mem[0xd200] = 0x00; // bit0 clear => Z should be 1 after BIT
    // Set PC to 0x0100
    const st0 = cpu.getState();
    cpu.setState({ ...st0, pc: 0x0100 });

    // Execute BIT
    let cycles = step(cpu);
    expect(cycles).toBe(20);
    // Execute JR Z (should take branch back -6 to 0x0100)
    cycles = step(cpu);
    expect(cycles).toBe(12); // taken JR is 12 cycles
    const st = cpu.getState();
    expect(st.pc & 0xffff).toBe(0x0100);
  });
});

