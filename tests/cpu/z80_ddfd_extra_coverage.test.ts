import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('DD/FD extra branch coverage', (): void => {
  it('DD ADC A,IXH uses carry', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: SCF; LD A,0x10; DD 8C (ADC A,H -> IXH)
    mem.set([0x37, 0x3e, 0x10, 0xdd, 0x8c], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, ix: 0x2000 });
    step(cpu); // SCF -> set carry
    step(cpu); // LD A,0x10
    const c = step(cpu); // ADC A,IXH (0x20) + carry => 0x31
    expect(c).toBe(4);
    expect(cpu.getState().a).toBe(0x31);
  });

  it('FD LD A,IYH (FD 7C) maps H->IYH', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xfd, 0x7c], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, iy: 0xee00 });
    const c = step(cpu);
    expect(c).toBe(4);
    expect(cpu.getState().a).toBe(0xee);
  });

  it('DD LD B,n (DD 06 nn) uses normal regs path', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xdd, 0x06, 0x77], 0x0000);
    const cpu = createZ80({ bus });
    const c = step(cpu);
    expect(c).toBe(7);
    expect(cpu.getState().b).toBe(0x77);
  });

  it('DD SUB A,B (DD 90) executes normal regs ALU path', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xdd, 0x90], 0x0000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, a: 0x10, b: 0x01 });
    const c = step(cpu);
    expect(c).toBe(4);
    expect(cpu.getState().a).toBe(0x0f);
  });
});
