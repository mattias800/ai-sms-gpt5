export class SegaMapper {
    constructor(rom) {
        this.bank0 = 0; // 0x0000-0x3fff
        this.bank1 = 1; // 0x4000-0x7fff
        this.bank2 = 2; // 0x8000-0xbfff
        this.ramInSlot0 = false; // When true, RAM is accessible at 0x0000-0x1FFF
        this.wramRef = null; // Reference to system RAM
        this.mapRead = (addr) => {
            const a = addr & 0xffff;
            // When RAM is mapped to slot 0, mirror system RAM
            if (this.ramInSlot0 && a < 0x2000 && this.wramRef) {
                // RAM at 0xC000-0xDFFF mirrors to 0x0000-0x1FFF
                return this.wramRef[a];
            }
            // First 1KB is always from bank 0 (unless RAM is mapped)
            if (a < 0x0400 && !this.ramInSlot0) {
                return this.banks[0][a];
            }
            const b0 = this.banks[this.bank0];
            const b1 = this.banks[this.bank1];
            const b2 = this.banks[this.bank2];
            if (a < 0x4000)
                return b0[a];
            if (a < 0x8000)
                return b1[a - 0x4000];
            // 0x8000-0xbfff
            return b2[a - 0x8000];
        };
        this.writeControl = (addr, val) => {
            const a = addr & 0xffff;
            const v = val & 0xff;
            // 0xfffc-0xffff control registers
            if (a === 0xfffc) {
                // Bit 3 (0x08) = RAM enable for slot 0
                this.ramInSlot0 = (v & 0x08) !== 0;
                // Bank select uses full byte value (masked by number of banks)
                this.bank0 = v % this.banks.length;
            }
            else if (a === 0xfffd) {
                this.bank1 = v % this.banks.length;
            }
            else if (a === 0xfffe) {
                this.bank2 = v % this.banks.length;
            }
            else if (a === 0xffff) {
                // SRAM control (ignored in this stub)
            }
        };
        // Set WRAM reference for RAM mirroring
        this.setWramRef = (wram) => {
            this.wramRef = wram;
        };
        // Handle writes when RAM is mapped to slot 0
        this.mapWrite = (addr, val) => {
            const a = addr & 0xffff;
            // When RAM is mapped to slot 0, allow writes to mirror back to system RAM
            if (this.ramInSlot0 && a < 0x2000 && this.wramRef) {
                this.wramRef[a] = val & 0xff;
                return true; // Write handled
            }
            return false; // Not handled, ROM area
        };
        if (rom.length % 0x4000 !== 0)
            throw new Error('ROM size must be multiple of 16KB');
        this.banks = [];
        for (let i = 0; i < rom.length; i += 0x4000)
            this.banks.push(rom.subarray(i, i + 0x4000));
        // Ensure at least 3 banks
        if (this.banks.length < 3) {
            const pad = new Uint8Array(0x4000);
            while (this.banks.length < 3)
                this.banks.push(pad);
        }
    }
}
export class SmsBus {
    constructor(cart, vdp, psg, opts) {
        this.wram = new Uint8Array(0x2000); // 8KB
        this.lastPSG = 0;
        this.ioControl = 0xff; // port 0x3F (direction/control), last write
        this.memControl = 0x00; // port 0x3E (memory control), last write
        // Optional cartridge RAM (commonly mapped at 0x8000-0xBFFF when enabled by memControl)
        this.cartRam = new Uint8Array(0x4000);
        this.cartRamEnabled = false; // controlled by 0x3E semantics
        // Conservative I/O direction/output scaffolding for controller ports
        this.ioDirMask = 0x00; // lower 6 bits: direction mask for lines on 0xDC/0xDD (1=output)
        this.ioOutLatch = 0xff; // generic output latch for lower 6 lines (active-high)
        // TH line latches (bit 6 of 0xDC/0xDD). On SMS, 0x3F bit6 drives TH-A, bit7 drives TH-B.
        this.thALatch = 1; // 1=high, 0=low
        this.thBLatch = 1; // 1=high, 0=low
        // Debug counters for H/V counter reads
        this.hCounterReads = 0;
        this.vCounterReads = 0;
        this.hCounterHist = new Uint32Array(256);
        // VDP mirror write counters for 0xBE/0xBF
        this.vdpDataWrites = 0; // 0xBE
        this.vdpCtrlWrites = 0; // 0xBF
        this.read8 = (addr) => {
            const a = addr & 0xffff;
            if (a < 0xc000) {
                // 0x0000-0xBFFF region: may include optional cart RAM mapping at 0x8000-0xBFFF
                if (a >= 0x8000 && this.cartRamEnabled) {
                    return this.cartRam[a - 0x8000];
                }
                return this.mapper.mapRead(a);
            }
            // WRAM 0xc000-0xdfff, mirror 0xe000-0xffff
            const waddr = (a - 0xc000) & 0x1fff;
            return this.wram[waddr];
        };
        this.write8 = (addr, val) => {
            const a = addr & 0xffff;
            const v = val & 0xff;
            if (a >= 0xfffc) {
                this.mapper.writeControl(a, v);
                return;
            }
            // Optional cartridge RAM region when enabled
            if (a >= 0x8000 && a <= 0xbfff && this.cartRamEnabled) {
                this.cartRam[a - 0x8000] = v;
                return;
            }
            if (a >= 0xc000) {
                const waddr = (a - 0xc000) & 0x1fff;
                this.wram[waddr] = v;
                return;
            }
            // Check if mapper handles the write (e.g., RAM mapped to slot 0)
            if (this.mapper.mapWrite && this.mapper.mapWrite(a, v)) {
                return;
            }
            // ROM area is not writable
        };
        this.readIO8 = (port) => {
            const p = port & 0xff;
            const low6 = p & 0x3f;
            // H/V counters (reads) are on 0x7E/0x7F; PSG is write-only on 0x7F
            if (this.vdp && (p === 0x7e || p === 0x7f)) {
                const v = this.vdp.readPort(p) & 0xff;
                if (p === 0x7e) {
                    this.hCounterReads++;
                    const idx = v & 0xff;
                    this.hCounterHist[idx] = ((this.hCounterHist[idx] ?? 0) + 1) >>> 0;
                }
                else {
                    this.vCounterReads++;
                }
                return v;
            }
            // Controller ports 0xDC/0xDD (active-low): default 0xFF (no buttons pressed)
            if (p === 0xdc || p === 0xdd) {
                // Base value: all inputs pulled high (no buttons pressed; active-low)
                let val = 0xff;
                // Drive lower 6 lines according to direction/output latch (conservative model)
                const lowerMask = this.ioDirMask & 0x3f;
                val = (val & ~lowerMask) | (this.ioOutLatch & lowerMask);
                // TH lines (bit 6) are driven from 0x3F upper bits; treat them as outputs for handshake
                if (p === 0xdc) {
                    // Port A TH on bit 6
                    if (this.thALatch)
                        val |= 0x40;
                    else
                        val &= ~0x40;
                }
                else {
                    // Port B TH on bit 6
                    if (this.thBLatch)
                        val |= 0x40;
                    else
                        val &= ~0x40;
                }
                return val & 0xff;
            }
            // I/O control and memory control reads typically undefined; return 0xFF
            if (p === 0x3f || p === 0x3e)
                return 0xff;
            // VDP mirrors across IO space: any port with low 6 bits 0x3e/0x3f maps to 0xbe/0xbf
            // Exclude real I/O control/mem control ports (0x3E/0x3F)
            if (this.vdp && (low6 === 0x3e || low6 === 0x3f) && p !== 0x3e && p !== 0x3f) {
                return this.vdp.readPort((p & 1) === 0 ? 0xbe : 0xbf);
            }
            return 0xff;
        };
        this.writeIO8 = (port, val) => {
            const p = port & 0xff;
            const low6 = p & 0x3f;
            const v = val & 0xff;
            // PSG on 0x7f (write-only) — must take precedence over VDP mirror on 0x3f low6
            if (p === 0x7f) {
                this.lastPSG = v;
                if (this.psg)
                    this.psg.write(v);
                return;
            }
            // I/O control and memory control ports
            if (p === 0x3f) {
                this.ioControl = v;
                // Lower 6 bits: direction mask for controller lines (1=output)
                this.ioDirMask = v & 0x3f;
                // Upper bits drive TH line latches: bit6 -> TH-A, bit7 -> TH-B
                this.thALatch = (v & 0x40) ? 1 : 0;
                this.thBLatch = (v & 0x80) ? 1 : 0;
                // Keep generic lower-line outputs default pulled high unless explicitly modeled elsewhere
                this.ioOutLatch |= 0x3f;
                return;
            }
            if (p === 0x3e) {
                this.memControl = v;
                // Enable optional cartridge RAM mapping at 0x8000-0xBFFF when bit3 is set and bus allows it.
                this.cartRamEnabled = this.allowCartRam && ((v & 0x08) !== 0);
                return;
            }
            // VDP mirrors across IO space: any port with low 6 bits 0x3e/0x3f maps to 0xbe/0xbf
            // Exclude real I/O control/mem control ports (0x3E/0x3F)
            if (this.vdp && (low6 === 0x3e || low6 === 0x3f)) {
                if ((p & 1) === 0) {
                    this.vdp.writePort(0xbe, v);
                    this.vdpDataWrites++;
                }
                else {
                    this.vdp.writePort(0xbf, v);
                    this.vdpCtrlWrites++;
                }
                return;
            }
        };
        // Test helpers
        this.getWram = () => this.wram;
        this.getLastPSG = () => this.lastPSG;
        this.getIOControl = () => this.ioControl;
        this.getMemControl = () => this.memControl;
        // Debug helper: summarize HCounter reads histogram
        this.getHCounterStats = () => {
            const res = [];
            for (let i = 0; i < 256; i++) {
                const c = this.hCounterHist[i];
                if (c)
                    res.push({ value: i, count: c });
            }
            res.sort((a, b) => b.count - a.count);
            return { total: this.hCounterReads, vreads: this.vCounterReads, top: res.slice(0, 8) };
        };
        this.getVDPWriteStats = () => ({ data: this.vdpDataWrites, control: this.vdpCtrlWrites });
        // Test helper to configure conservative IO mask explicitly
        this.__setIOMaskForTest = (dirMask, outLatch) => {
            this.ioDirMask = dirMask & 0xff;
            this.ioOutLatch = outLatch & 0xff;
        };
        this.mapper = new SegaMapper(cart.rom);
        // Pass WRAM reference to mapper for RAM mirroring
        if (this.mapper.setWramRef) {
            this.mapper.setWramRef(this.wram);
        }
        this.vdp = vdp ?? null;
        this.psg = psg ?? null;
        this.allowCartRam = opts?.allowCartRam ?? true;
    }
}
// Backwards-compat simple RAM-only bus for earlier util tests
export class SimpleBus {
    constructor(size = 0x10000) {
        this.getMemory = () => this.mem;
        this.read8 = (addr) => this.mem[addr & 0xffff];
        this.write8 = (addr, val) => {
            this.mem[addr & 0xffff] = val & 0xff;
        };
        this.readIO8 = (port) => {
            void port;
            return 0xff;
        };
        this.writeIO8 = (port, val) => {
            void port;
            void val;
        };
        this.mem = new Uint8Array(size);
    }
}
