export const createPSG = () => {
    const state = {
        latchedReg: 0,
        tones: [0, 0, 0],
        vols: [0xf, 0xf, 0xf, 0xf],
        noise: { mode: 0, shift: 0 },
    };
    const write = (val) => {
        const b = val & 0xff;
        if (b & 0x80) {
            // Latch + data
            const reg = (b >>> 4) & 0x07;
            state.latchedReg = reg;
            const data = b & 0x0f;
            applyData(reg, data);
        }
        else {
            // Data only applies to last latched reg; use lower 6 bits per SN76489 spec
            const reg = state.latchedReg;
            const data = b & 0x3f;
            applyData(reg, data);
        }
    };
    const applyData = (reg, data) => {
        switch (reg) {
            case 0: // tone 0 low 4 bits
                state.tones[0] = (state.tones[0] & 0x3f0) | (data & 0x0f);
                break;
            case 1: // tone 0 high 6 bits
                state.tones[0] = (state.tones[0] & 0x00f) | ((data & 0x3f) << 4);
                break;
            case 2:
                state.tones[1] = (state.tones[1] & 0x3f0) | (data & 0x0f);
                break;
            case 3:
                state.tones[1] = (state.tones[1] & 0x00f) | ((data & 0x3f) << 4);
                break;
            case 4:
                state.tones[2] = (state.tones[2] & 0x3f0) | (data & 0x0f);
                break;
            case 5:
                state.tones[2] = (state.tones[2] & 0x00f) | ((data & 0x3f) << 4);
                break;
            case 6: // noise control (simplified)
                state.noise = { mode: (data >>> 2) & 0x03, shift: data & 0x03 };
                break;
            case 7: // volume for channel selected by upper bits of latch
                // For volumes, the reg index (7) with prior latch upper bits indicate which channel volume is targeted.
                // Simplify: map by last latch upper index: 0->ch0,2->ch1,4->ch2,6->noise
                {
                    const idxMap = { 0: 0, 2: 1, 4: 2, 6: 3 };
                    const which = idxMap[state.latchedReg & 0x06] ?? 0;
                    state.vols[which] = data & 0x0f;
                }
                break;
            default:
                break;
        }
    };
    const tickCycles = (_cpuCycles) => {
        void _cpuCycles;
        // Placeholder: no audio generation yet; kept for determinism compatibility
    };
    const getState = () => ({
        latchedReg: state.latchedReg,
        tones: [...state.tones],
        vols: [...state.vols],
        noise: { ...state.noise },
    });
    return { write, tickCycles, getState };
};
