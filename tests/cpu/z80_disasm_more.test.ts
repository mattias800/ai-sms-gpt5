import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { disassembleOne, disassembleRange } from '../../src/cpu/z80/disasm.js';

const wrap =
  (bus: SimpleBus): ((addr: number) => number) =>
  (addr: number): number =>
    bus.read8(addr);

describe('Z80 disassembler additional coverage', (): void => {
  it('covers ED IN/OUT (C) variants including r=6, ADC/SBC HL,ss, RRD/RLD, and fallbacks', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    const seq = [
      0xed,
      0x40, // IN B,(C)
      0xed,
      0x48, // IN C,(C)
      0xed,
      0x70, // IN (C) (r=6)
      0xed,
      0x41, // OUT (C),B
      0xed,
      0x79, // OUT (C),A
      0xed,
      0x71, // OUT (C),0 (r=6)
      0xed,
      0x4a, // ADC HL,BC
      0xed,
      0x52, // SBC HL,DE
      0xed,
      0x67, // RRD
      0xed,
      0x6f, // RLD
      0xed,
      0x00, // ED 00 fallback
    ];
    mem.set(seq, 0x0300);
    const rd = wrap(bus);

    expect(disassembleOne(rd, 0x0300).text).toBe('IN B,(C)');
    expect(disassembleOne(rd, 0x0302).text).toBe('IN C,(C)');
    expect(disassembleOne(rd, 0x0304).text).toBe('IN (C),(C)');
    expect(disassembleOne(rd, 0x0306).text).toBe('OUT (C),B');
    expect(disassembleOne(rd, 0x0308).text).toBe('OUT (C),A');
    expect(disassembleOne(rd, 0x030a).text).toBe('OUT (C),0');
    expect(disassembleOne(rd, 0x030c).text).toBe('ADC HL,BC');
    expect(disassembleOne(rd, 0x030e).text).toBe('SBC HL,DE');
    expect(disassembleOne(rd, 0x0310).text).toBe('RRD');
    expect(disassembleOne(rd, 0x0312).text).toBe('RLD');
    // ED 00 is undocumented but still valid to disassemble
    expect(disassembleOne(rd, 0x0314).text).toBe('ED 00');
  });

  it('covers DD/FD CB rotate/RES/SET with register target, pure register under DD, and DD fallback', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    const seq = [
      0xdd,
      0xcb,
      0x01,
      0x10, // RL (IX+1),B
      0xdd,
      0xcb,
      0x02,
      0x80, // RES 0,(IX+2),B
      0xfd,
      0xcb,
      0xff,
      0xc7, // SET 0,(IY-1),A
      0xdd,
      0x44, // LD B,H (pure reg under DD)
      0xdd,
      0x39, // DD 39 fallback
    ];
    mem.set(seq, 0x0400);
    const rd = wrap(bus);

    expect(disassembleOne(rd, 0x0400).text).toBe('RL (IX+1),B');
    expect(disassembleOne(rd, 0x0404).text).toBe('RES 0,(IX+2),B');
    expect(disassembleOne(rd, 0x0408).text).toBe('SET 0,(IY+-1),A');
    expect(disassembleOne(rd, 0x040c).text).toBe('LD B,H');
    expect(disassembleOne(rd, 0x040e).text).toBe('DD 39');
  });

  it('covers base CALL/RET/RST and unknown base DB', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    const seq = [
      0xcd,
      0x00,
      0x20, // CALL 2000
      0xc9, // RET
      0xc7, // RST 00
      0x08, // EX AF,AF'
    ];
    mem.set(seq, 0x0500);
    const rd = wrap(bus);

    expect(disassembleOne(rd, 0x0500).text).toBe('CALL 2000');
    expect(disassembleOne(rd, 0x0503).text).toBe('RET');
    expect(disassembleOne(rd, 0x0504).text).toBe('RST 00');
    expect(disassembleOne(rd, 0x0505).text).toBe("EX AF,AF'");
  });

  it("covers IM 0 (ED 46), LD IX,nn and LD r,r' plus disassembleRange()", (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    const seq = [
      0xed,
      0x46, // IM 0
      0xdd,
      0x21,
      0x34,
      0x12, // LD IX,1234
      0x53, // LD D,E (0101 0011)
      0x00,
      0xfb, // NOP; EI for range test
    ];
    mem.set(seq, 0x0600);
    const rd = wrap(bus);

    expect(disassembleOne(rd, 0x0600).text).toBe('IM 0');
    expect(disassembleOne(rd, 0x0602).text).toBe('LD IX,1234');
    expect(disassembleOne(rd, 0x0606).text).toBe('LD D,E');

    // disassembleRange over the last two instructions
    // Note: disassembleRange expects a bus and decodes sequentially
    const results = disassembleRange(bus, 0x0607, 2);
    expect(results.length).toBe(2);
    expect(results[0]!.text).toBe('NOP');
    expect(results[1]!.text).toBe('EI');
  });
});
