import { createZ80, type IZ80 } from '../cpu/z80/z80.js';
import { SmsBus, type Cartridge } from '../bus/bus.js';
import { createVDP, type IVDP } from '../vdp/vdp.js';
import { createPSG, type IPSG } from '../psg/sn76489.js';
import { createSmsWaitHooks } from './waits.js';
import { createController, type IController } from '../io/controller.js';
import { initializeSMS, enableSMSInterrupts } from './sms_init.js';

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
  // Optional CPU debug hooks for instrumentation
  cpuDebugHooks?: import('../cpu/z80/z80.js').Z80DebugHooks | undefined;
  // Optional per-cycle hook for diagnostics; called every CPU cycle after devices tick
  cycleHook?: ((cycle: number) => void) | undefined;
  // Use manual SMS initialization instead of BIOS (default: true)
  useManualInit?: boolean | undefined;
}

export interface IMachine {
  runCycles: (cycles: number) => void;
  getCPU: () => IZ80;
  getVDP: () => IVDP;
  getPSG: () => IPSG;
  getBus: () => SmsBus;
  getController1: () => IController;
  getController2: () => IController;
  // Allow setting a per-cycle hook dynamically for diagnostics
  setCycleHook: (hook: ((cycle: number) => void) | null) => void;
  // Debug stats for web UI
  getDebugStats: () => { irqAccepted: number; iff1: boolean; iff2: boolean; im: number; halted: boolean; pc: number };
}

export const createMachine = (cfg: MachineConfig): IMachine => {
  const vdp = createVDP();
  const psg = createPSG();
  const controller1 = createController();
  const controller2 = createController();
  
  // Use manual initialization by default (skip BIOS)
  const useManualInit = cfg.useManualInit ?? true;
  const bus = new SmsBus(cfg.cart, vdp, psg, controller1, controller2, { 
    allowCartRam: cfg.bus?.allowCartRam ?? true, 
    bios: useManualInit ? null : cfg.bus?.bios ?? null 
  });

  // Optional wait-state hooks
  const waitHooks = cfg.wait?.smsModel
    ? createSmsWaitHooks({
        includeWaitInCycles: cfg.wait.includeWaitInCycles ?? false,
        vdpPenalty: cfg.wait.vdpPenalty,
      })
    : null;

  let irqAcceptedCount = 0;
  let eiCount = 0;
  let diCount = 0;
  let lastEiPc = 0;
  let lastDiPc = 0;
  let retiCount = 0;
  let retnCount = 0;
  let lastRetiPc = 0;
  let lastRetnPc = 0;
  // IFF change diagnostics
  let iffChangeCount = 0;
  let lastIffReason = '';
  let lastIffPc = 0;
  // IRQ acceptance diagnostics
  let lastIrqAcceptPc = 0;
  let retFinalIrqCount = 0;
  let retFinalNmiCount = 0;
  let lastIrqGateReason = '';
  let lastIrqGatePc = 0;
  // Dynamic per-cycle hook (optional; used by tools/web diagnostics)
  let dynamicCycleHook: ((cycle: number) => void) | null = null;

  const cpu = createZ80({
    bus,
    waitStates: waitHooks ?? null,
    onTrace: (ev) => {
      // Minimal tracing: count IRQ acceptances for diagnostics
      if (ev.irqAccepted) { irqAcceptedCount++; lastIrqAcceptPc = ev.pcBefore & 0xffff; }
      // Count EI/DI occurrences by opcode
      if (ev.opcode === 0xfb) { eiCount++; lastEiPc = ev.pcBefore & 0xffff; }
      if (ev.opcode === 0xf3) { diCount++; lastDiPc = ev.pcBefore & 0xffff; }
      // Count RETI/RETN when disasm bytes are present (traceDisasm=true)
      if (ev.opcode === 0xed && Array.isArray(ev.bytes) && ev.bytes.length >= 2) {
        const sub = ev.bytes[1] & 0xff;
        if (sub === 0x4d) { // RETI
          retiCount++;
          lastRetiPc = ev.pcBefore & 0xffff;
        } else if (sub === 0x45) { // RETN
          retnCount++;
          lastRetnPc = ev.pcBefore & 0xffff;
        }
      }
      // Forward to external trace if provided
      if (typeof cfg.trace?.onTrace === 'function') cfg.trace.onTrace(ev);
    },
    traceDisasm: !!cfg.trace?.traceDisasm,
    traceRegs: !!cfg.trace?.traceRegs,
    // Enable block-op collapsing for better performance and cycle accuracy
    experimentalFastBlockOps: true,
    // Wire the per-cycle callback so every CPU-internal micro-op advances devices
    onCycle: (_cy) => {
      vdp.tickCycles(1);
      psg.tickCycles(1);
      if (vdp.hasIRQ()) cpu.requestIRQ();
      if (dynamicCycleHook) dynamicCycleHook(1);
    },
    debugHooks: {
      ...cfg.cpuDebugHooks,
      onIFFChange: (iff1: boolean, iff2: boolean, pcBefore: number, reason: string): void => {
        iffChangeCount++;
        lastIffReason = `${reason}:${iff1?1:0}/${iff2?1:0}`;
        lastIffPc = pcBefore & 0xffff;
        if (reason.startsWith('RET-final-IRQ') || reason.startsWith('RETcc-final-IRQ') || reason.startsWith('RETI')) retFinalIrqCount++;
        if (reason.startsWith('RET-final-NMI') || reason.startsWith('RETcc-final-NMI') || reason.startsWith('RETN')) retFinalNmiCount++;
        if (cfg.cpuDebugHooks?.onIFFChange) cfg.cpuDebugHooks.onIFFChange(iff1, iff2, pcBefore, reason);
      },
      onIrqGate: (pcBefore: number, reason: string): void => {
        lastIrqGatePc = pcBefore & 0xffff;
        lastIrqGateReason = reason;
        if (cfg.cpuDebugHooks?.onIrqGate) cfg.cpuDebugHooks.onIrqGate(pcBefore, reason);
      },
    },
  });

  // Initialize SMS system manually (replaces BIOS)
  if (useManualInit) {
    initializeSMS({ cpu, vdp, psg, bus });
  }

  // Maintain a running cycle budget so we don't drift when an instruction overshoots the per-call budget
  let cycleBudget = 0;
  const runCycles = (cycles: number): void => {
    cycleBudget += cycles | 0;
    while (cycleBudget > 0) {
      const { cycles: c } = cpu.stepOne();
      cycleBudget -= c | 0;
      if (cycleBudget <= 0) break;
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
    setCycleHook: (hook: ((cycle: number) => void) | null): void => {
      dynamicCycleHook = hook ?? null;
    },
    getDebugStats: (): { irqAccepted: number; iff1: boolean; iff2: boolean; im: number; halted: boolean; pc: number; eiCount: number; diCount: number; lastEiPc: number; lastDiPc: number; retiCount: number; retnCount: number; lastRetiPc: number; lastRetnPc: number; iffChangeCount: number; lastIffReason: string; lastIffPc: number; lastIrqAcceptPc: number; retFinalIrqCount: number; retFinalNmiCount: number; lastIrqGatePc: number; lastIrqGateReason: string } => {
      const s = cpu.getState();
      return {
        irqAccepted: irqAcceptedCount | 0,
        iff1: !!s.iff1,
        iff2: !!s.iff2,
        im: s.im as number,
        halted: !!s.halted,
        pc: s.pc & 0xffff,
        eiCount: eiCount | 0,
        diCount: diCount | 0,
        lastEiPc: lastEiPc & 0xffff,
        lastDiPc: lastDiPc & 0xffff,
        retiCount: retiCount | 0,
        retnCount: retnCount | 0,
        lastRetiPc: lastRetiPc & 0xffff,
        lastRetnPc: lastRetnPc & 0xffff,
        iffChangeCount: iffChangeCount | 0,
        lastIffReason,
        lastIffPc: lastIffPc & 0xffff,
        lastIrqAcceptPc: lastIrqAcceptPc & 0xffff,
        retFinalIrqCount: retFinalIrqCount | 0,
        retFinalNmiCount: retFinalNmiCount | 0,
        lastIrqGatePc: lastIrqGatePc & 0xffff,
        lastIrqGateReason: lastIrqGateReason,
      };
    },
  };
};
