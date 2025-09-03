import { createZ80, type IZ80 } from '../cpu/z80/z80.js';
import { SmsBus, type Cartridge } from '../bus/bus.js';
import { createVDP, type IVDP } from '../vdp/vdp.js';
import { createPSG } from '../psg/sn76489.js';
import { createSmsWaitHooks } from './waits.js';

export interface MachineWaitConfig {
  smsModel?: boolean;
  includeWaitInCycles?: boolean;
  vdpPenalty?: number;
}

export interface MachineConfig {
  cart: Cartridge;
  wait?: MachineWaitConfig | undefined;
  bus?: { allowCartRam?: boolean } | undefined;
  trace?:
    | {
        onTrace?: ((ev: import('../cpu/z80/z80.js').TraceEvent) => void) | undefined;
        traceDisasm?: boolean | undefined;
        traceRegs?: boolean | undefined;
      }
    | undefined;
  // Experimental CPU acceleration options
  fastBlocks?: boolean | undefined;
}

export interface IMachine {
  runCycles: (cycles: number) => void;
  getCPU: () => IZ80;
  getVDP: () => IVDP;
  getBus: () => SmsBus;
}

export const createMachine = (cfg: MachineConfig): IMachine => {
  const vdp = createVDP();
  const psg = createPSG();
  const bus = new SmsBus(cfg.cart, vdp, psg, { allowCartRam: cfg.bus?.allowCartRam ?? true });

  // Optional wait-state hooks
  const waitHooks = cfg.wait?.smsModel
    ? createSmsWaitHooks({
        includeWaitInCycles: cfg.wait.includeWaitInCycles ?? false,
        vdpPenalty: cfg.wait.vdpPenalty,
      })
    : null;

  const cpu = createZ80({
    bus,
    waitStates: waitHooks ?? null,
    onTrace: cfg.trace?.onTrace ?? (() => {}),
    traceDisasm: !!cfg.trace?.traceDisasm,
    traceRegs: !!cfg.trace?.traceRegs,
    experimentalFastBlockOps: !!cfg.fastBlocks,
  });

  const runCycles = (cycles: number): void => {
    let remaining = cycles;
    while (remaining > 0) {
      const { cycles: c } = cpu.stepOne();
      remaining -= c;
      vdp.tickCycles(c);
      psg.tickCycles(c);
      // Poll VDP IRQ line and request CPU IRQ; acceptance handled by CPU core
      if (vdp.hasIRQ()) cpu.requestIRQ();
    }
  };

  return { runCycles, getCPU: (): IZ80 => cpu, getVDP: (): IVDP => vdp, getBus: (): SmsBus => bus };
};
