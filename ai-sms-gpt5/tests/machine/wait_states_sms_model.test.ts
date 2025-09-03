import { describe, it, expect } from 'vitest';
import { createMachine, type MachineConfig } from '../../src/machine/machine.js';
import type { Cartridge } from '../../src/bus/bus.js';

const romWith = (bytes: number[]): Cartridge => {
  const rom = new Uint8Array(0x4000 * 3);
  rom.set(bytes, 0x0000);
  return { rom };
};

describe('Machine SMS wait-state model', (): void => {
  it('adds VDP IO write penalty to OUT (n),A for port 0xBE', (): void => {
    // Program: OUT (0xBE),A ; NOP
    const cart = romWith([0xd3, 0xbe, 0x00]);
    const mach = createMachine({ cart, wait: { smsModel: true, includeWaitInCycles: true, vdpPenalty: 4 } as MachineConfig['wait'] });
    const cpu = mach.getCPU();
    const c = cpu.stepOne().cycles; // OUT immediate
    expect(c).toBe(11 + 4);
  });

  it('adds VDP IO read penalty to IN A,(n) for port 0xBF', (): void => {
    // Program: IN A,(0xBF) ; NOP
    const cart = romWith([0xdb, 0xbf, 0x00]);
    const mach = createMachine({ cart, wait: { smsModel: true, includeWaitInCycles: true, vdpPenalty: 4 } });
    const cpu = mach.getCPU();
    const c = cpu.stepOne().cycles; // IN immediate
    expect(c).toBe(11 + 4);
  });

  it('does not penalize PSG port 0x7F', (): void => {
    // Program: OUT (0x7F),A ; NOP
    const cart = romWith([0xd3, 0x7f, 0x00]);
    const mach = createMachine({ cart, wait: { smsModel: true, includeWaitInCycles: true, vdpPenalty: 4 } });
    const cpu = mach.getCPU();
    const c = cpu.stepOne().cycles;
    expect(c).toBe(11);
  });
});

