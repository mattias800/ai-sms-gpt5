import { createZ80 } from '../cpu/z80/z80.js';
import { SmsBus } from '../bus/bus.js';
import { createVDP } from '../vdp/vdp.js';
import { createPSG } from '../psg/sn76489.js';
import { createSmsWaitHooks } from './waits.js';
export const createMachine = (cfg) => {
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
        onTrace: cfg.trace?.onTrace ?? (() => { }),
        traceDisasm: !!cfg.trace?.traceDisasm,
        traceRegs: !!cfg.trace?.traceRegs,
        experimentalFastBlockOps: !!cfg.fastBlocks,
    });
    const runCycles = (cycles) => {
        let remaining = cycles;
        while (remaining > 0) {
            const { cycles: c } = cpu.stepOne();
            remaining -= c;
            vdp.tickCycles(c);
            psg.tickCycles(c);
            // Poll VDP IRQ line and request CPU IRQ; acceptance handled by CPU core
            if (vdp.hasIRQ())
                cpu.requestIRQ();
        }
    };
    return { runCycles, getCPU: () => cpu, getVDP: () => vdp, getBus: () => bus };
};
//# sourceMappingURL=machine.js.map