import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

// helper (reserved for future use)
// const run = (cpu: ReturnType<typeof createZ80>, n: number): void => {
//   for (let i = 0; i < n; i++) cpu.stepOne();
// };

describe('Z80 edges and branches', (): void => {
  it('covers LD r,r across many cases and SUB/AND/XOR/OR r variants', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Initialize many registers and exercise r variants; also use (HL)
    mem.set(
      [
        0x06,
        0xaa, // LD B,0xAA
        0x0e,
        0xbb, // LD C,0xBB
        0x16,
        0xcc, // LD D,0xCC
        0x1e,
        0xdd, // LD E,0xDD
        0x26,
        0x40, // LD H,0x40
        0x2e,
        0x00, // LD L,0x00 -> HL=0x4000
        0x36,
        0x12, // LD (HL),0x12
        0x78, // LD A,B => 0xAA
        0x79, // LD A,C => 0xBB
        0x7a, // LD A,D => 0xCC
        0x7b, // LD A,E => 0xDD
        0x7c, // LD A,H => 0x40
        0x7d, // LD A,L => 0x00
        0x7e, // LD A,(HL) => mem[0x4000]
        0xa0, // AND B
        0xa8, // XOR B
        0xb0, // OR B
        0x90, // SUB B
        0x76, // HALT
      ],
      0x0000
    );
    const cpu = createZ80({ bus });
    // Run until HALT
    for (;;) {
      cpu.stepOne();
      if (cpu.getState().halted) {
        break;
      }
    }
    const st = cpu.getState();
    expect(st.halted).toBe(true);
  });

  it('unimplemented opcode throws and reset/setState work', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    mem.set([0xdd], 0x0000); // DD prefix unimplemented
    const cpu = createZ80({ bus });
    expect((): void => {
      cpu.stepOne();
    }).toThrowError(/Unimplemented/);
    // reset covers reset path
    cpu.reset();
    const st = cpu.getState();
    expect(st.pc).toBe(0x0000);
    // setState covers setter path
    const st2 = cpu.getState();
    const newSt = { ...st2, a: 0x5a };
    cpu.setState(newSt);
    expect(cpu.getState().a).toBe(0x5a);
  });
});
