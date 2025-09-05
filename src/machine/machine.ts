import { createZ80, type IZ80 } from '../cpu/z80/z80.js';
import { SmsBus, type Cartridge } from '../bus/bus.js';
import { createVDP, type IVDP } from '../vdp/vdp.js';
import { createPSG, type IPSG } from '../psg/sn76489.js';
import { createSmsWaitHooks } from './waits.js';
import { createController, type IController } from '../io/controller.js';

export interface MachineWaitConfig {
  smsModel?: boolean;
  includeWaitInCycles?: boolean;
  vdpPenalty?: number;
}

export interface MachineConfig {
  cart: Cartridge;
  wait?: MachineWaitConfig | undefined;
  bus?: { allowCartRam?: boolean; bios?: Uint8Array | null } | undefined;
  trace?:
    | {
        onTrace?: ((ev: import('../cpu/z80/z80.js').TraceEvent) => void) | undefined;
        traceDisasm?: boolean | undefined;
        traceRegs?: boolean | undefined;
      }
    | undefined;
  // Experimental CPU acceleration options
  fastBlocks?: boolean | undefined;
  // Optional CPU debug hooks for instrumentation
  cpuDebugHooks?: import('../cpu/z80/z80.js').Z80DebugHooks | undefined;
}

export interface IMachine {
  runCycles: (cycles: number) => void;
  getCPU: () => IZ80;
  getVDP: () => IVDP;
  getPSG: () => IPSG;
  getBus: () => SmsBus;
  getController1: () => IController;
  getController2: () => IController;
}

export const createMachine = (cfg: MachineConfig): IMachine => {
  const vdp = createVDP();
  const psg = createPSG();
  const controller1 = createController();
  const controller2 = createController();
  const bus = new SmsBus(cfg.cart, vdp, psg, controller1, controller2, { allowCartRam: cfg.bus?.allowCartRam ?? true, bios: cfg.bus?.bios ?? null });

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
    debugHooks: cfg.cpuDebugHooks,
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

  return {
    runCycles,
    getCPU: (): IZ80 => cpu,
    getVDP: (): IVDP => vdp,
    getPSG: (): IPSG => psg,
    getBus: (): SmsBus => bus,
    getController1: (): IController => controller1,
    getController2: (): IController => controller2,
  };
};
