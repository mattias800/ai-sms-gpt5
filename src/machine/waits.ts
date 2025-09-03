import type { WaitStateHooks } from '../cpu/z80/z80.js';

export interface SmsWaitModelConfig {
  includeWaitInCycles?: boolean | undefined;
  vdpPenalty?: number | undefined; // extra cycles per VDP port IO access
}

export const createSmsWaitHooks = (cfg?: SmsWaitModelConfig | null): WaitStateHooks => {
  const pen = (cfg?.vdpPenalty ?? 4) | 0;
  const include = cfg?.includeWaitInCycles ?? false;
  return {
    enabled: true,
    includeWaitInCycles: include,
    memPenalty: (_addr: number, _isWrite: boolean): number => 0,
    ioPenalty: (port: number, _isWrite: boolean): number => {
      const p = port & 0xff;
      if (p === 0x7f) return 0; // PSG port is not penalized
      const low6 = p & 0x3f;
      // VDP mirrors across IO space: low6==0x3e (0xbe) or 0x3f (0xbf)
      if (low6 === 0x3e || low6 === 0x3f) return pen;
      return 0;
    },
  };
};
