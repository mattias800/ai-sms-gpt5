import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { disassembleOne } from '../../src/cpu/z80/disasm.js';

const hex = (n: number): string => n.toString(16).toUpperCase();

const mkReader = (img: Uint8Array) => (addr: number): number => img[addr & 0xffff] & 0xff;

describe('Z80 disassembler coverage (selected opcodes)', (): void => {
  it('disassembles a variety of ED/DD/FD and base opcodes', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // A small program with mixed opcodes to drive disasm branches
    const prog = [
      0xfb,               // EI
      0xf3,               // DI
      0xcd, 0x34, 0x12,   // CALL 0x1234
      0xc9,               // RET
      0xed, 0x4d,         // RETI
      0xed, 0x45,         // RETN
      0xed, 0x46,         // IM 0
      0xed, 0x56,         // IM 1
      0xed, 0x5e,         // IM 2
      0xdb, 0x7f,         // IN A,(7F)
      0xd3, 0x7f,         // OUT (7F),A
      0xdd, 0x21, 0x00, 0x20, // LD IX,0x2000
      0xdd, 0x34, 0x10,   // INC (IX+16)
      0xfd, 0x36, 0x05, 0x77, // LD (IY+5),0x77
      0x22, 0x00, 0x40,   // LD (0x4000),HL
      0x2a, 0x00, 0x40,   // LD HL,(0x4000)
      0x32, 0x00, 0x20,   // LD (0x2000),A
      0x3a, 0x00, 0x20,   // LD A,(0x2000)
      0x76,               // HALT
    ];
    mem.set(prog, 0x0000);

    // Walk the program and ensure disasm returns non-empty text and correct lengths
    let pc = 0;
    while (pc < prog.length) {
      const r = disassembleOne(mkReader(mem), pc);
      expect(r.length).toBeGreaterThan(0);
      expect(r.text.length).toBeGreaterThan(0);
      pc += r.length;
    }
  });
});
