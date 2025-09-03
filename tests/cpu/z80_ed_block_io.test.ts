import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 ED block I/O: INI/IND/INIR/INDR/OUTI/OUTD/OTIR/OTDR', (): void => {
  it('INI writes from port to (HL), increments HL, decrements B (16 cycles)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4000; LD B,0x02; LD C,0x7f; ED A2 (INI)
    mem.set([0x21, 0x00, 0x40, 0x06, 0x02, 0x0e, 0x7f, 0xed, 0xa2], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu); // LD HL
    step(cpu); // LD B
    step(cpu); // LD C
    const c = step(cpu); // INI
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4001);
    expect(st.b).toBe(0x01);
    expect(mem[0x4000]).toBe(0xff); // SimpleBus returns 0xff for reads
  });

  it('OUTI writes (HL) to port, increments HL, decrements B (16 cycles)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4100; LD B,0x01; LD C,0x7f; LD (HL),0x12; ED A3 (OUTI)
    mem.set([0x21, 0x00, 0x41, 0x06, 0x01, 0x0e, 0x7f, 0x36, 0x12, 0xed, 0xa3], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu); // LD HL
    step(cpu); // LD B
    step(cpu); // LD C
    step(cpu); // LD (HL),0x12
    const c = step(cpu); // OUTI
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4101);
    expect(st.b).toBe(0x00);
  });

  it('IND writes from port to (HL), decrements HL, decrements B', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4201; LD B,0x02; LD C,0x7f; ED AA (IND)
    mem.set([0x21, 0x01, 0x42, 0x06, 0x02, 0x0e, 0x7f, 0xed, 0xaa], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu);
    step(cpu);
    step(cpu);
    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4200);
    expect(st.b).toBe(0x01);
    expect(mem[0x4201]).toBe(0xff);
  });

  it('OUTD writes (HL) to port, decrements HL, decrements B', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4301; LD B,0x02; LD C,0x7f; LD (HL),0x34; ED AB (OUTD)
    mem.set([0x21, 0x01, 0x43, 0x06, 0x02, 0x0e, 0x7f, 0x36, 0x34, 0xed, 0xab], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu);
    step(cpu);
    step(cpu);
    step(cpu);
    const c = step(cpu);
    expect(c).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4300);
    expect(st.b).toBe(0x01);
  });

  it('INIR repeats until B==0 (21/16 cycles) and fills memory', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4400; LD B,0x02; LD C,0x7f; ED B2 (INIR)
    mem.set([0x21, 0x00, 0x44, 0x06, 0x02, 0x0e, 0x7f, 0xed, 0xb2], 0x0000);
    const cpu = createZ80({ bus });
    step(cpu);
    step(cpu);
    step(cpu);
    const c1 = step(cpu);
    expect(c1).toBe(21);
    const c2 = step(cpu);
    expect(c2).toBe(16);
    const st = cpu.getState();
    expect((st.h << 8) | st.l).toBe(0x4402);
    expect(st.b).toBe(0x00);
    expect(mem[0x4400]).toBe(0xff);
    expect(mem[0x4401]).toBe(0xff);
  });

  it('OTDR repeats until B==0 (21/16 cycles) and moves memory upwards', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // LD HL,0x4501; LD B,0x02; LD C,0x7f; LD (0x4501)=0xaa; LD (0x4500)=0xbb; ED BB (OTDR)
    mem.set([0x21, 0x01, 0x45, 0x06, 0x02, 0x0e, 0x7f, 0x36, 0xaa, 0x2b, 0x36, 0xbb, 0x23, 0xed, 0xbb], 0x0000);
    const cpu = createZ80({ bus });
    // Steps: LD HL; LD B; LD C; LD (HL)=0xaa; DEC HL; LD (HL)=0xbb; INC HL; OTDR
    step(cpu);
    step(cpu);
    step(cpu);
    step(cpu);
    step(cpu);
    step(cpu);
    step(cpu);
    const c1 = step(cpu);
    expect(c1).toBe(21);
    const c2 = step(cpu);
    expect(c2).toBe(16);
    const st = cpu.getState();
    // HL decremented twice from 0x4501 -> 0x4500 -> 0x44ff
    expect((st.h << 8) | st.l).toBe(0x44ff);
    expect(st.b).toBe(0x00);
  });
});
