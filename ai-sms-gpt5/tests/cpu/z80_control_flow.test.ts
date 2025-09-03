import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

const setPC = (cpu: ReturnType<typeof createZ80>, pc: number): void => {
  const st = cpu.getState();
  cpu.setState({ ...st, pc: pc & 0xffff });
};

describe('Z80 control flow: JR/JP/CALL/RET/RST/DJNZ', (): void => {
  it('JR and JR cc have expected cycles and displacement', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JR +2 ; JR NZ,+2 ; HALT
    mem.set([0x18, 0x02, 0x20, 0x02, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // Unconditional JR
    let c = step(cpu);
    expect(c).toBe(12);
    expect(cpu.getState().pc).toBe(0x0004);
    // JR NZ (flags Z=0 by default) at address 0x0002
    const stMid = cpu.getState();
    cpu.setState({ ...stMid, pc: 0x0002 });
    c = step(cpu);
    expect(c).toBe(12);
    expect(cpu.getState().pc).toBe(0x0006);
  });

  it('JR cc not taken is 7 cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JR Z,+1 ; HALT
    mem.set([0x28, 0x01, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // Force Z=0
    const st = cpu.getState();
    cpu.setState({ ...st, f: st.f & ~0x40 });
    const c = step(cpu);
    expect(c).toBe(7);
    expect(cpu.getState().pc).toBe(0x0002);
  });

  it('DJNZ taken vs not taken cycles', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // DJNZ +2 ; DJNZ -2 ; HALT
    mem.set([0x10, 0x02, 0x10, 0xfe, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    // B defaults 0; set to 1 so first DJNZ falls through with 8 cycles? Actually B becomes 0, so not taken
    let st = cpu.getState();
    cpu.setState({ ...st, b: 1 });
    let c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x0002);
    // Set B=2 so decrement to 1 causes taken
    st = cpu.getState();
    cpu.setState({ ...st, b: 2 });
    c = step(cpu);
    expect(c).toBe(13);
    expect(cpu.getState().pc).toBe(0x0002);
  });

  it('JP nn and JP cc,nn', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JP 0x1234 ; JP Z,0x5678 ; HALT
    mem.set([0xc3, 0x34, 0x12, 0xca, 0x78, 0x56, 0x76], 0x0000);
    const cpu = createZ80({ bus });
    let c = step(cpu);
    expect(c).toBe(10);
    expect(cpu.getState().pc).toBe(0x1234);
    // Place JP Z at 0x1234
    mem.set([0xca, 0x78, 0x56], 0x1234);
    setPC(cpu, 0x1234);
    c = step(cpu);
    expect(c).toBe(10); // condition false by default
    // PC advanced over immediate (to 0x1237)
    expect(cpu.getState().pc).toBe(0x1237);
  });

  it('JP (HL) and JP (IX/IY)', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // JP (HL); HALT at target
    mem.set([0xe9], 0x0000);
    mem.set([0x76], 0x2000);
    const cpu = createZ80({ bus });
    const st = cpu.getState();
    cpu.setState({ ...st, h: 0x20, l: 0x00 });
    let c = step(cpu);
    expect(c).toBe(4);
    expect(cpu.getState().pc).toBe(0x2000);

    // JP (IX)
    mem.set([0xdd, 0xe9], 0x0100);
    mem.set([0x76], 0x3000);
    setPC(cpu, 0x0100);
    let st2 = cpu.getState();
    cpu.setState({ ...st2, ix: 0x3000 });
    c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x3000);
    // JP (IY)
    mem.set([0xfd, 0xe9], 0x0200);
    mem.set([0x76], 0x4000);
    setPC(cpu, 0x0200);
    st2 = cpu.getState();
    cpu.setState({ ...st2, iy: 0x4000 });
    c = step(cpu);
    expect(c).toBe(8);
    expect(cpu.getState().pc).toBe(0x4000);
  });

  it('CALL/CALL cc and RET/RET cc and RST', (): void => {
    const bus = new SimpleBus();
    const mem = bus.getMemory();
    // 0000: CALL 0006 ; HALT
    // 0006: RST 38h ; HALT (unreached)
    mem.set([0xcd, 0x06, 0x00, 0x76], 0x0000);
    mem.set([0xff, 0x76], 0x0006);
    const cpu = createZ80({ bus });
    let c = step(cpu);
    expect(c).toBe(17);
    expect(cpu.getState().pc).toBe(0x0006);
    // Execute RST 38h
    c = step(cpu);
    expect(c).toBe(11);
    expect(cpu.getState().pc).toBe(0x0038);

    // Test RET cc not taken (RET Z with Z=0)
    mem.set([0xc8, 0x76], 0x0100);
    setPC(cpu, 0x0100);
    let c2 = step(cpu);
    expect(c2).toBe(5);
    // Test RET taken
    mem.set([0xc9], 0x0110);
    setPC(cpu, 0x0110);
    // Push a return address
    let st = cpu.getState();
    const ret = 0x2222;
    cpu.setState({ ...st, sp: 0x8000 });
    // place ret on stack (lo at [sp], hi at [sp+1])
    const m = bus.getMemory();
    m[0x8000] = ret & 0xff;
    m[0x8001] = (ret >>> 8) & 0xff;
    c2 = step(cpu);
    expect(c2).toBe(10);
    expect(cpu.getState().pc).toBe(ret);

    // CALL cc (NZ) not taken
    mem.set([0xc4, 0x34, 0x12], 0x0120);
    setPC(cpu, 0x0120);
    st = cpu.getState();
    cpu.setState({ ...st, f: st.f | 0x40 }); // Z=1
    c2 = step(cpu);
    expect(c2).toBe(10);
    expect(cpu.getState().pc).toBe(0x0123);
  });
});
