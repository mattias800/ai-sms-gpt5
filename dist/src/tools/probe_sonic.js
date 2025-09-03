import { createMachine } from '../machine/machine.js';
import { readFileSync } from 'fs';
const isBlockIO = (ed2) => {
    switch (ed2 & 0xff) {
        case 0xa2: return 'INI';
        case 0xaa: return 'IND';
        case 0xb2: return 'INIR';
        case 0xba: return 'INDR';
        case 0xa3: return 'OUTI';
        case 0xab: return 'OUTD';
        case 0xb3: return 'OTIR';
        case 0xbb: return 'OTDR';
        default: return null;
    }
};
async function main() {
    const romPath = process.argv[2] ?? './sonic.sms';
    const seconds = Number(process.argv[3] ?? '5');
    const rom = new Uint8Array(readFileSync(romPath));
    const cart = { rom };
    const probe = {
        frames: 0,
        sawEI: false,
        // firstEIPC set later when seen
        imSet: [],
        blockIO: { INI: 0, IND: 0, INIR: 0, INDR: 0, OUTI: 0, OUTD: 0, OTIR: 0, OTDR: 0 },
        blockIOFlags: { N: 0, H: 0, C: 0, PV: 0 },
        cramWrites: 0,
        hInImm: 0,
        hInC: 0,
        hInPCs: {},
        cpAfterH: {},
        inFEA: {},
        jrAfterIn: { taken: 0, notTaken: 0 },
        statusReads: 0,
        statusA: {},
        statusVBlankSet: 0,
        inImmByPort: {},
        outImmByPort: {},
        inCByPort: {},
        outCByPort: {},
        pcHist: {},
        samples: [],
    };
    // State: after IN A,(0x7E), capture a few following ops
    let captureCount = 0;
    let currentSample = null;
    const maxSamples = 8;
    let pendingJR = null;
    const onTrace = (ev) => {
        // Hot PC histogram (coarse). Limit stored keys to avoid unbounded growth.
        const pcK = `0x${((ev.pcBefore ?? 0) & 0xffff).toString(16)}`;
        const hist = probe.pcHist;
        if (hist) {
            hist[pcK] = ((hist[pcK] ?? 0) + 1) >>> 0;
            // Optionally drop tail if too many unique keys
            const maxUnique = 2048;
            if (Object.keys(hist).length > maxUnique) {
                // crude compaction: delete a few smallest entries
                const entries = Object.entries(hist);
                entries.sort((a, b) => a[1] - b[1]);
                for (let i = 0; i < 64 && i < entries.length; i++)
                    delete hist[entries[i][0]];
            }
        }
        // Resolve pending JR target check
        if (pendingJR) {
            const nextPC = ev.pcBefore & 0xffff;
            if (pendingJR.expectTaken) {
                if (nextPC === (pendingJR.takenTarget & 0xffff))
                    probe.jrAfterIn.taken++;
                else if (nextPC === (pendingJR.fallThrough & 0xffff))
                    probe.jrAfterIn.notTaken++;
            }
            else {
                if (nextPC === (pendingJR.fallThrough & 0xffff))
                    probe.jrAfterIn.notTaken++;
                else if (nextPC === (pendingJR.takenTarget & 0xffff))
                    probe.jrAfterIn.taken++;
            }
            pendingJR = null;
        }
        // EI (0xFB)
        if (ev.opcode === 0xfb && !probe.sawEI) {
            probe.sawEI = true;
            probe.firstEIPC = `0x${(ev.pcBefore & 0xffff).toString(16)}`;
        }
        const bb = ev.bytes;
        if (!bb || bb.length === 0)
            return;
        // IN A,(n) immediate port
        if (bb[0] === 0xdb && bb.length >= 2) {
            const portImm = bb[1] & 0xff;
            const pk = `0x${portImm.toString(16)}`;
            probe.inImmByPort[pk] = (probe.inImmByPort[pk] ?? 0) + 1;
            if (portImm === 0x7e) {
                probe.hInImm++;
                const k = `0x${(ev.pcBefore & 0xffff).toString(16)}`;
                probe.hInPCs[k] = (probe.hInPCs[k] ?? 0) + 1;
                // Record A after IN (post-instruction regs)
                const a = (ev.regs?.a ?? 0) & 0xff;
                const ak = `0x${a.toString(16)}`;
                probe.inFEA[ak] = (probe.inFEA[ak] ?? 0) + 1;
                captureCount = 6; // capture next few instructions for CP and branches
                if ((probe.samples?.length ?? 0) < maxSamples) {
                    currentSample = { pc: k, seq: [] };
                    probe.samples?.push(currentSample);
                }
                else {
                    currentSample = null;
                }
            }
            else if (portImm === 0xbf) {
                // VDP status register read
                probe.statusReads++;
                const a = (ev.regs?.a ?? 0) & 0xff;
                const ak = `0x${a.toString(16)}`;
                probe.statusA[ak] = (probe.statusA[ak] ?? 0) + 1;
                if ((a & 0x80) !== 0)
                    probe.statusVBlankSet++;
            }
        }
        // IN r,(C) group: ED 40/48/50/58/60/68/70/78
        if (bb[0] === 0xed && (bb.length >= 2)) {
            const sub = (bb[1] & 0xff);
            if ((sub & 0xc7) === 0x40) {
                const cVal = ev.regs?.c ?? 0xff;
                const cp = (cVal & 0xff);
                const ck = `0x${cp.toString(16)}`;
                probe.inCByPort[ck] = (probe.inCByPort[ck] ?? 0) + 1;
                if (cp === 0x7e) {
                    probe.hInC++;
                    const k = `0x${(ev.pcBefore & 0xffff).toString(16)}`;
                    probe.hInPCs[k] = (probe.hInPCs[k] ?? 0) + 1;
                    captureCount = 6;
                    if ((probe.samples?.length ?? 0) < maxSamples) {
                        currentSample = { pc: k, seq: [] };
                        probe.samples?.push(currentSample);
                    }
                    else {
                        currentSample = null;
                    }
                }
            }
        }
        // If we see JR NZ,d right after IN, compute expected branch and check next pc
        if (bb[0] === 0x20 && bb.length >= 2) {
            const b1 = bb[1];
            const d = ((b1 & 0x80) ? (b1 - 0x100) : b1) | 0;
            const fallThrough = ((ev.pcBefore + 2) & 0xffff);
            const takenTarget = ((ev.pcBefore + 2 + d) & 0xffff);
            const f = ev.regs?.f ?? 0;
            const z = (f & 0x40) !== 0;
            const expectTaken = !z; // JR NZ taken when Z==0
            pendingJR = { takenTarget, fallThrough, expectTaken };
        }
        // If capturing, look for CP n (0xFE imm)
        if (captureCount > 0) {
            captureCount--;
            if (currentSample) {
                currentSample.seq.push({ pc: `0x${(ev.pcBefore & 0xffff).toString(16)}`, text: ev.text ?? '', bytes: (bb.slice(0, Math.min(bb.length, 4))) });
            }
            if (bb[0] === 0xfe) {
                // Prefer immediate from trace bytes if present; otherwise peek ROM at pc+1
                let imm = undefined;
                if (bb.length >= 2)
                    imm = bb[1] & 0xff;
                else {
                    const pc1 = ((ev.pcBefore ?? 0) + 1) & 0xffff;
                    imm = (rom[pc1] ?? 0) & 0xff;
                }
                const k = `0x${(imm & 0xff).toString(16)}`;
                probe.cpAfterH[k] = (probe.cpAfterH[k] ?? 0) + 1;
            }
            if (captureCount === 0)
                currentSample = null;
        }
        // OUT (n),A immediate port
        if (bb[0] === 0xd3 && bb.length >= 2) {
            const portImm = bb[1] & 0xff;
            const pk = `0x${portImm.toString(16)}`;
            probe.outImmByPort[pk] = (probe.outImmByPort[pk] ?? 0) + 1;
        }
        // OUT (C),r group: ED 41/49/51/59/61/69/71/79
        if (bb[0] === 0xed && (bb.length >= 2)) {
            const sub = (bb[1] & 0xff);
            if ((sub & 0xc7) === 0x41) {
                const cVal = ev.regs?.c ?? 0xff;
                const cp = (cVal & 0xff);
                const ck = `0x${cp.toString(16)}`;
                probe.outCByPort[ck] = (probe.outCByPort[ck] ?? 0) + 1;
            }
        }
        // IM changes: ED 46 -> IM 0; ED 56 -> IM 1; ED 5E -> IM 2
        if (bb[0] === 0xed) {
            const sub = (bb.length >= 2 ? bb[1] : 0) & 0xff;
            if (sub === 0x46)
                probe.imSet.push(0);
            else if (sub === 0x56)
                probe.imSet.push(1);
            else if (sub === 0x5e)
                probe.imSet.push(2);
            const name = isBlockIO(sub);
            if (name) {
                // Count block I/O and collect resulting flags
                probe.blockIO[name]++;
                const f = ev.regs?.f ?? 0;
                if (f & 0x02)
                    probe.blockIOFlags.N++;
                if (f & 0x10)
                    probe.blockIOFlags.H++;
                if (f & 0x01)
                    probe.blockIOFlags.C++;
                if (f & 0x04)
                    probe.blockIOFlags.PV++;
            }
        }
    };
    const m = createMachine({
        cart,
        wait: { smsModel: true, includeWaitInCycles: false, vdpPenalty: 4 },
        bus: { allowCartRam: false },
        trace: { onTrace, traceDisasm: true, traceRegs: true },
    });
    const vdp = m.getVDP();
    const st0 = vdp.getState ? vdp.getState() : undefined;
    const cyclesPerFrame = (st0?.cyclesPerLine ?? 228) * (st0?.linesPerFrame ?? 262);
    const maxFrames = Math.max(1, Math.floor(seconds * 60));
    for (let i = 0; i < maxFrames; i++) {
        m.runCycles(cyclesPerFrame);
        probe.frames++;
    }
    const st = vdp.getState ? vdp.getState() : undefined;
    probe.cramWrites = st?.cramWrites ?? 0;
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(probe, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=probe_sonic.js.map