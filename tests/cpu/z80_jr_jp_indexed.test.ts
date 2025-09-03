import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

const setIX = (cpu: ReturnType<typeof createZ80>, ix: number): void => {
  const st = cpu.getState();
  cpu.setState({ ...st, ix: ix & 0xffff });
};
const setIY = (cpu: ReturnType<typeof createZ80>, iy: number): void => {
  const st = cpu.getState();
  cpu.setState({ ...st, iy: iy & 0xffff });
};

describe('Z80 JR and JP indexed coverage', (): void => {
  it('JR d with positive and negative offsets', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JR +4; NOP; NOP; NOP; NOP; JR -4 (place second JR at index 6)
    mem.set([0x18, 0x04, 0x00, 0x00, 0x00, 0x00, 0x18, 0xfc], 0x0000);
    const cpu = createZ80({ bus });
    let c = step(cpu);
    expect(c).toBe(12);
    expect(cpu.getState().pc).toBe(0x0006); // 2+4
    c = step(cpu);
    expect(c).toBe(12);
    expect(cpu.getState().pc).toBe(0x0004); // 6-2
  });

  it('JP (IX) and JP (IY) jump to index register', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // DD E9 (JP (IX)); FD E9 (JP (IY))
    mem.set([0xdd, 0xe9, 0xfd, 0xe9], 0x0000);
    const cpu = createZ80({ bus });
    setIX(cpu, 0x1234);
    let c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x1234);

    // Place second JP at the target and test IY
    setIY(cpu, 0x2000);
    const st = cpu.getState();
    mem.set([0xfd, 0xe9], 0x1234);
    cpu.setState({ ...st, pc: 0x1234 });
    c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x2000);
  });
});
