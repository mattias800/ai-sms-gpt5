import { describe, it, expect } from 'vitest';
import { SimpleBus } from '../../src/bus/bus.js';
import { createZ80 } from '../../src/cpu/z80/z80.js';
import { FLAG_N, FLAG_Z } from '../../src/cpu/z80/flags.js';

const step = (cpu: ReturnType<typeof createZ80>): number => cpu.stepOne().cycles;

describe('Z80 ED-prefixed SBC/ADC HL,ss additional branches', (): void => {
  it('SBC HL,HL yields zero with Z and N set; SBC HL,SP subtracts SP', (): void => {
    // SBC HL,HL
    {
      const bus = new SimpleBus();
      const mem = bus.getMemory();
      // LD H,0x00; LD L,0x02; SBC HL,HL; HALT
      mem.set([0x26, 0x00, 0x2e, 0x02, 0xed, 0x62, 0x76], 0x0000);
      const cpu = createZ80({ bus });
      step(cpu); // LD H
      step(cpu); // LD L
      const c = step(cpu); // SBC HL,HL
      expect(c).toBe(15);
      const st = cpu.getState();
      expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0000);
      expect((st.f & FLAG_N) !== 0).toBe(true);
      expect((st.f & FLAG_Z) !== 0).toBe(true);
    }

    // SBC HL,SP
    {
      const bus = new SimpleBus();
      const mem = bus.getMemory();
      // LD H,0x00; LD L,0x10; SBC HL,SP; HALT
      mem.set([0x26, 0x00, 0x2e, 0x10, 0xed, 0x72, 0x76], 0x0000);
      const cpu = createZ80({ bus });
      step(cpu); // LD H
      step(cpu); // LD L
      // Set SP=0x0001 before SBC
      const st0 = cpu.getState();
      cpu.setState({ ...st0, sp: 0x0001 });
      const c = step(cpu); // SBC HL,SP
      expect(c).toBe(15);
      const st = cpu.getState();
      expect(((st.h << 8) | st.l) & 0xffff).toBe(0x000f);
      expect((st.f & FLAG_N) !== 0).toBe(true);
    }
  });

  it('ADC HL,HL and ADC HL,SP take 15 cycles and compute sums', (): void => {
    // ADC HL,HL
    {
      const bus = new SimpleBus();
      const mem = bus.getMemory();
      // LD H,0x12; LD L,0x34; ADC HL,HL; HALT
      mem.set([0x26, 0x12, 0x2e, 0x34, 0xed, 0x6a, 0x76], 0x0000);
      const cpu = createZ80({ bus });
      step(cpu); // LD H
      step(cpu); // LD L
      const c = step(cpu); // ADC HL,HL
      expect(c).toBe(15);
      const st = cpu.getState();
      expect(((st.h << 8) | st.l) & 0xffff).toBe(0x2468);
    }

    // ADC HL,SP
    {
      const bus = new SimpleBus();
      const mem = bus.getMemory();
      // LD H,0x00; LD L,0x01; ADC HL,SP; HALT
      mem.set([0x26, 0x00, 0x2e, 0x01, 0xed, 0x7a, 0x76], 0x0000);
      const cpu = createZ80({ bus });
      step(cpu); // LD H
      step(cpu); // LD L
      // Set SP=0x0001 before ADC
      const st0 = cpu.getState();
      cpu.setState({ ...st0, sp: 0x0001 });
      const c = step(cpu);
      expect(c).toBe(15);
      const st = cpu.getState();
      expect(((st.h << 8) | st.l) & 0xffff).toBe(0x0002);
    }
  });
});
