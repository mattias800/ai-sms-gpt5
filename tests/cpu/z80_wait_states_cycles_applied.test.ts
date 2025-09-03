import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80, type WaitStateHooks } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): { cycles: number } => cpu.stepOne();

describe('Z80 wait-states applied to reported cycles when enabled', (): void => {
  it('NOP cycles include wait penalties when includeWaitInCycles=true', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // NOP; HALT
    mem.set([0x00, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1, // +1 per memory access
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });

    const r1 = step(cpu);
    // NOP base cycles=4; penalties: peek(1)+fetch(1) => +2 => expect 6
    expect(r1.cycles).toBe(6);
    const s1 = cpu.getState();
    expect(s1.pc).toBe(0x0001);
  });

  it('LD (HL),n cycles include wait penalties when includeWaitInCycles=true', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD (HL),0x12 ; HALT
    mem.set([0x36, 0x12, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // Set HL to 0x4000
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00 });

    const r = step(cpu);
    // Base cycles for LD (HL),n in this core path: 7
    // Wait penalties: peek(1)+fetch(1)+imm read(1)+mem write(1) => +4
    // Expected: 7+4=11
    expect(r.cycles).toBe(11);
    const s2 = cpu.getState();
    expect(s2.pc).toBe(0x0002);
  });

  it('POP HL cycles include memory read penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // POP HL ; HALT
    mem.set([0xe1, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // Initialize SP and stack contents at 0x4000/0x4001
    const st0 = cpu.getState();
    cpu.setState({ ...st0, sp: 0x4000 });
    mem.set([0x34], 0x4000); // low byte
    mem.set([0x12], 0x4001); // high byte

    const r = step(cpu);
    // Base cycles: 10; penalties: peek(1)+fetch(1)+two mem reads(2) => +4
    expect(r.cycles).toBe(14);
    const s3 = cpu.getState();
    expect(s3.pc).toBe(0x0001);
    expect(s3.h).toBe(0x12);
    expect(s3.l).toBe(0x34);
  });

  it('JP (HL) cycles include opcode fetch penalties (no memory operand)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JP (HL)
    mem.set([0xe9], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // Set HL to some address (does not cause memory access in JP (HL))
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00 });

    const r = step(cpu);
    // Base cycles: 4; penalties: peek(1)+fetch(1) => +2 => expect 6
    expect(r.cycles).toBe(6);
    const s4 = cpu.getState();
    expect(s4.pc).toBe(0x4000);
  });

  it('LDI cycles include opcode fetch and memory read/write penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED A0 (LDI); HALT
    mem.set([0xed, 0xa0, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000 (source), DE=0x5000 (dest), BC=1
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, d: 0x50, e: 0x00, b: 0x00, c: 0x01 });
    mem.set([0x2a], 0x4000);

    const r = step(cpu);
    // Base cycles: 16; penalties: peek(1)+ED fetch(1)+sub fetch(1)+mem read(1)+mem write(1) => +5
    expect(r.cycles).toBe(21);
    const s5 = cpu.getState();
    expect(((s5.h << 8) | s5.l) & 0xffff).toBe(0x4001);
    expect(((s5.d << 8) | s5.e) & 0xffff).toBe(0x5001);
    expect(((s5.b << 8) | s5.c) & 0xffff).toBe(0x0000);
    expect(s5.pc).toBe(0x0002);
  });

  it('IN A,(n) cycles include opcode/imm fetch penalties and IO penalty', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // IN A,(0x10); HALT
    mem.set([0xdb, 0x10, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });

    const r = step(cpu);
    // Base cycles: 11; penalties: peek(1)+opcode fetch(1)+imm fetch(1) => +3; IO penalty +2 => 11+3+2=16
    expect(r.cycles).toBe(16);
    const s6 = cpu.getState();
    expect(s6.pc).toBe(0x0002);
  });

  it('LDIR repeat step includes repeat-overhead cycles and penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED B0 (LDIR); HALT
    mem.set([0xed, 0xb0, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000 (source), DE=0x5000 (dest), BC=2
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, d: 0x50, e: 0x00, b: 0x00, c: 0x02 });
    mem.set([0xaa, 0xbb], 0x4000);

    const r = step(cpu);
    // Base cycles: 21; penalties: peek(1)+ED fetch(1)+sub fetch(1)+mem read(1)+mem write(1) => +5
    expect(r.cycles).toBe(26);
    const s7 = cpu.getState();
    expect(((s7.h << 8) | s7.l) & 0xffff).toBe(0x4001);
    expect(((s7.d << 8) | s7.e) & 0xffff).toBe(0x5001);
    expect(((s7.b << 8) | s7.c) & 0xffff).toBe(0x0001);
    expect(s7.pc).toBe(0x0000);
  });

  it('CPIR repeat step includes repeat-overhead cycles and penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED B1 (CPIR); HALT
    mem.set([0xed, 0xb1, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // A=0x10; HL=0x4000 where memory != A (e.g., 0x20); BC=2
    const st0 = cpu.getState();
    cpu.setState({ ...st0, a: 0x10, h: 0x40, l: 0x00, b: 0x00, c: 0x02 });
    mem.set([0x20, 0x30], 0x4000);

    const r = step(cpu);
    // Base cycles: 21; penalties: peek(1)+ED fetch(1)+sub fetch(1)+mem read(1) => +4
    expect(r.cycles).toBe(25);
    const s8 = cpu.getState();
    expect(((s8.h << 8) | s8.l) & 0xffff).toBe(0x4001);
    expect(((s8.b << 8) | s8.c) & 0xffff).toBe(0x0001);
    expect(s8.pc).toBe(0x0000);
  });

  it('CPDR repeat step includes repeat-overhead cycles and penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED B9 (CPDR); HALT
    mem.set([0xed, 0xb9, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // A=0x10; HL=0x4001 (start high, will dec); memory != A; BC=2
    const st0 = cpu.getState();
    cpu.setState({ ...st0, a: 0x10, h: 0x40, l: 0x01, b: 0x00, c: 0x02 });
    mem.set([0x20, 0x30], 0x4000);

    const r = step(cpu);
    // Base cycles: 21; penalties: peek(1)+ED fetch(1)+sub fetch(1)+mem read(1) => +4
    expect(r.cycles).toBe(25);
  });

  it('INDR repeat step includes opcode, prefix, and I/O/memory penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED BA (INDR); HALT
    mem.set([0xed, 0xba, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000, B=2, C=0x10
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, b: 0x02, c: 0x10 });

    const r = step(cpu);
    // Base 21 + penalties: peek(1)+ED(1)+sub(1)+mem write(1) + io(2) => 21+4+2 = 27
    expect(r.cycles).toBe(27);
    const s10 = cpu.getState();
    expect(((s10.h << 8) | s10.l) & 0xffff).toBe(0x3fff);
    expect(s10.b & 0xff).toBe(0x01);
    expect(s10.pc).toBe(0x0000);
  });

  it('OTIR repeat step includes opcode, prefix, memory read and I/O penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED B3 (OTIR); HALT
    mem.set([0xed, 0xb3, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000 with one byte, B=2, C=0x10
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, b: 0x02, c: 0x10 });
    mem.set([0x55], 0x4000);

    const r = step(cpu);
    // Base 21 + penalties: peek(1)+ED(1)+sub(1)+mem read(1) + io(2) => 21+4+2 = 27
    expect(r.cycles).toBe(27);
    const s12 = cpu.getState();
    expect(((s12.h << 8) | s12.l) & 0xffff).toBe(0x4001);
    expect(s12.b & 0xff).toBe(0x01);
    expect(s12.pc).toBe(0x0000);
  });

  it('INIR repeat step includes opcode, prefix, memory write and I/O penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED B2 (INIR); HALT
    mem.set([0xed, 0xb2, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000, B=2, C=0x10
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, b: 0x02, c: 0x10 });

    const r = step(cpu);
    // Base 21 + penalties: peek(1)+ED(1)+sub(1)+mem write(1) + IO(2) => 27
    expect(r.cycles).toBe(27);
    const s13 = cpu.getState();
    expect(((s13.h << 8) | s13.l) & 0xffff).toBe(0x4001);
    expect(s13.b & 0xff).toBe(0x01);
    expect(s13.pc).toBe(0x0000);
  });

  it('OTDR repeat step includes opcode, prefix, memory read and I/O penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED BB (OTDR); HALT
    mem.set([0xed, 0xbb, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000 with one byte, B=2, C=0x10
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, b: 0x02, c: 0x10 });
    mem.set([0x77], 0x4000);

    const r = step(cpu);
    // Base 21 + penalties: peek(1)+ED(1)+sub(1)+mem read(1) + IO(2) => 27
    expect(r.cycles).toBe(27);
  });

  it('IM1 IRQ acceptance includes peek and stack write penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP at 0x0000 so nextOp != HALT
    mem.set([0x00, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // Enable IM1 and IFF1
    const st0 = cpu.getState();
    cpu.setState({ ...st0, im: 1, iff1: true, iff2: true });
    cpu.requestIRQ();

    const r = step(cpu);
    // Base 13 + peek(1) + two stack writes(2) => 16
    expect(r.cycles).toBe(16);
    const st1 = cpu.getState();
    expect(st1.pc).toBe(0x0038);
  });

  it('IM2 IRQ acceptance includes peek, stack writes, and vector table read penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program: NOP at 0x0000
    mem.set([0x00, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // Set IM2, I register, and vector table
    const st0 = cpu.getState();
    cpu.setState({ ...st0, im: 2, i: 0x20, iff1: true, iff2: true });
    cpu.setIM2Vector(0x10);
    // Vector table at 0x2010 -> address 0x1234
    mem.set([0x34, 0x12], 0x2010);

    cpu.requestIRQ();
    const r = step(cpu);
    // Base 19 + peek(1) + two stack writes(2) + two vector reads(2) => 24
    expect(r.cycles).toBe(24);
    const st1 = cpu.getState();
    expect(st1.pc).toBe(0x1234);
  });

  it('INI (non-repeat) includes opcode/prefix/sub fetch, IO and memory penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED A2 (INI); HALT
    mem.set([0xed, 0xa2, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000, B=2, C=0x10
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, b: 0x02, c: 0x10 });

    const r = step(cpu);
    // Base 16 + penalties: peek(1)+ED(1)+sub(1)+mem write(1)+IO(2) => 16+5+2=23? Wait IO is 2 already counted; actually 16 + 3 (peek+ED+sub) + 1 (mem write) + 2 (io) = 22
    expect(r.cycles).toBe(22);
    const s14 = cpu.getState();
    expect(((s14.h << 8) | s14.l) & 0xffff).toBe(0x4001);
    expect(s14.b & 0xff).toBe(0x01);
    expect(s14.pc).toBe(0x0002);
  });

  it('OUTD (non-repeat) includes opcode/prefix/sub fetch, memory and IO penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // ED AB (OUTD); HALT
    mem.set([0xed, 0xab, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 2,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // HL=0x4000 with one byte, B=2, C=0x10
    const st0 = cpu.getState();
    cpu.setState({ ...st0, h: 0x40, l: 0x00, b: 0x02, c: 0x10 });
    mem.set([0x5a], 0x4000);

    const r = step(cpu);
    // Base 16 + penalties: peek(1)+ED(1)+sub(1)+mem read(1)+IO(2) => 22
    expect(r.cycles).toBe(22);
  });

  it('IM0 default (vector) acceptance includes peek and stack write penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at 0x0000: NOP
    mem.set([0x00, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // IM0 enabled, interrupts enabled
    const st0 = cpu.getState();
    cpu.setState({ ...st0, im: 0, iff1: true, iff2: true });
    // Default im0Vector is 0x0038
    cpu.requestIRQ();

    const r = step(cpu);
    // Base 13 + peek(1) + two stack writes(2) => 16
    expect(r.cycles).toBe(16);
    const st1 = cpu.getState();
    expect(st1.pc).toBe(0x0038);
  });

  it('IM0 injected RST opcode acceptance includes peek and stack write penalties', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // Program at 0x0000: NOP
    mem.set([0x00, 0x76], 0x0000);

    const ws: WaitStateHooks = {
      enabled: true,
      memPenalty: () => 1,
      ioPenalty: () => 0,
      includeWaitInCycles: true,
    };

    const cpu = createZ80({ bus, waitStates: ws });
    // IM0 with injected RST 08h opcode (0xCF)
    const st0 = cpu.getState();
    cpu.setState({ ...st0, im: 0, iff1: true, iff2: true });
    cpu.setIM0Opcode(0xcf);
    cpu.requestIRQ();

    const r = step(cpu);
    // Base 13 + peek(1) + two stack writes(2) => 16
    expect(r.cycles).toBe(16);
    const st1 = cpu.getState();
    expect(st1.pc).toBe(0x0008);
  });
});
