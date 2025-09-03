export const createSmsWaitHooks = (cfg) => {
    const pen = (cfg?.vdpPenalty ?? 4) | 0;
    const include = cfg?.includeWaitInCycles ?? false;
    return {
        enabled: true,
        includeWaitInCycles: include,
        memPenalty: (_addr, _isWrite) => 0,
        ioPenalty: (port, _isWrite) => {
            const p = port & 0xff;
            if (p === 0x7f)
                return 0; // PSG port is not penalized
            const low6 = p & 0x3f;
            // VDP mirrors across IO space: low6==0x3e (0xbe) or 0x3f (0xbf)
            if (low6 === 0x3e || low6 === 0x3f)
                return pen;
            return 0;
        },
    };
};
//# sourceMappingURL=waits.js.map