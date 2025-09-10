import { IVDP } from '../vdp/vdp.js';
import { type IPSG } from '../psg/sn76489.js';
import { IController } from '../io/controller.js';

export interface IBus {
  read8: (addr: number) => number;
  write8: (addr: number, val: number) => void;
  readIO8: (port: number) => number;
  writeIO8: (port: number, val: number) => void;
}

export interface Cartridge {
  readonly rom: Uint8Array;
}

export interface IMapper {
  mapRead: (addr: number) => number;
  mapWrite?: (addr: number, val: number) => boolean; // Returns true if write handled
  writeControl: (addr: number, val: number) => void;
  setWramRef?: (wram: Uint8Array) => void;
}

export class SegaMapper implements IMapper {
  private readonly banks: Uint8Array[];
  private bank0 = 0; // 0x0000-0x3fff
  private bank1 = 1; // 0x4000-0x7fff
  private bank2 = 2; // 0x8000-0xbfff
  private ramInSlot0 = false; // When true, RAM is accessible at 0x0000-0x1FFF
  private wramRef: Uint8Array | null = null; // Reference to system RAM

  constructor(rom: Uint8Array) {
    if (rom.length % 0x4000 !== 0) throw new Error('ROM size must be multiple of 16KB');
    this.banks = [];
    for (let i = 0; i < rom.length; i += 0x4000) this.banks.push(rom.subarray(i, i + 0x4000));
    // Ensure at least 3 banks
    if (this.banks.length < 3) {
      const pad = new Uint8Array(0x4000);
      while (this.banks.length < 3) this.banks.push(pad);
    }
  }

  public mapRead = (addr: number): number => {
    const a = addr & 0xffff;

    // When RAM is mapped to slot 0, mirror system RAM
    if (this.ramInSlot0 && a < 0x2000 && this.wramRef) {
      // RAM at 0xC000-0xDFFF mirrors to 0x0000-0x1FFF
      return this.wramRef[a]!;
    }

    // First 1KB is always from bank 0 (unless RAM is mapped)
    if (a < 0x0400 && !this.ramInSlot0) {
      return this.banks[0]![a]!;
    }
    const b0 = this.banks[this.bank0]!;
    const b1 = this.banks[this.bank1]!;
    const b2 = this.banks[this.bank2]!;
    if (a < 0x4000) return b0[a]!;
    if (a < 0x8000) return b1[a - 0x4000]!;
    // 0x8000-0xbfff
    return b2[a - 0x8000]!;
  };

  public writeControl = (addr: number, val: number): void => {
    const a = addr & 0xffff;
    const v = val & 0xff;
    // 0xfffc-0xffff control registers
    if (a === 0xfffc) {
      // 0xFFFC is RAM control register
      // Bit 3 (0x08) = RAM enable for slot 0 (mirroring 0xC000-0xDFFF at 0x0000-0x1FFF)
      // Bit 4 (0x10) = RAM enable for slot 2 (cartridge RAM)
      // Bit 2 (0x04) = BIOS disable
      const before = this.ramInSlot0;
      this.ramInSlot0 = (v & 0x08) !== 0;
      // Debug: log transitions for slot-0 RAM mapping to diagnose stack mirroring issues
      try {
        if (before !== this.ramInSlot0 && typeof process !== 'undefined' && (process as any).env && (process as any).env.DEBUG_MAPPER) {
          // eslint-disable-next-line no-console
          console.log(`mapper: RAM-in-slot0 ${(this.ramInSlot0 ? 'ENABLED' : 'DISABLED')} via 0xFFFC=${v.toString(16).toUpperCase().padStart(2,'0')}`);
        }
      } catch {}
      // 0xFFFC does NOT control bank switching
    } else if (a === 0xfffd) {
      // 0xFFFD controls bank at slot 0 (0x0000-0x3FFF)
      this.bank0 = v % this.banks.length;
    } else if (a === 0xfffe) {
      // 0xFFFE controls bank at slot 1 (0x4000-0x7FFF)
      this.bank1 = v % this.banks.length;
    } else if (a === 0xffff) {
      // 0xFFFF controls bank at slot 2 (0x8000-0xBFFF)
      this.bank2 = v % this.banks.length;
    }
  };

  // Set WRAM reference for RAM mirroring
  public setWramRef = (wram: Uint8Array): void => {
    this.wramRef = wram;
  };

  // Handle writes when RAM is mapped to slot 0
  public mapWrite = (addr: number, val: number): boolean => {
    const a = addr & 0xffff;
    // When RAM is mapped to slot 0, allow writes to mirror back to system RAM
    if (this.ramInSlot0 && a < 0x2000 && this.wramRef) {
      this.wramRef[a] = val & 0xff;
      return true; // Write handled
    }
    return false; // Not handled, ROM area
  };
}

export interface BusOptions {
  allowCartRam: boolean;
}

export class SmsBus implements IBus {
  private readonly wram: Uint8Array = new Uint8Array(0x2000); // 8KB
  private readonly mapper: IMapper;
  private readonly vdp: IVDP | null;
  private readonly psg: IPSG | null;
  private readonly controller1: IController | null;
  private readonly controller2: IController | null;
  private readonly allowCartRam: boolean;
  private readonly bios: Uint8Array | null = null; // Optional BIOS image
  private biosEnabled: boolean = true; // BIOS mapped at reset until disabled via 0x3E bit2
  private lastPSG: number = 0;
  private ioControl: number = 0xff; // port 0x3F (direction/control), last write
  private memControl: number = 0x00; // port 0x3E (memory control), last write
  // Optional cartridge RAM (commonly mapped at 0x8000-0xBFFF when enabled by memControl)
  private readonly cartRam: Uint8Array = new Uint8Array(0x4000);
  private cartRamEnabled: boolean = false; // controlled by 0x3E semantics
  // Conservative I/O direction/output scaffolding for controller ports
  private ioDirMask: number = 0x00; // lower 6 bits: direction mask for lines on 0xDC/0xDD (1=output)
  private ioOutLatch: number = 0xff; // generic output latch for lower 6 lines (active-high)
  // TH line latches (bit 6 of 0xDC/0xDD). On SMS, 0x3F bit6 drives TH-A, bit7 drives TH-B.
  private thALatch: number = 1; // 1=high, 0=low
  private thBLatch: number = 1; // 1=high, 0=low
  // Debug counters for H/V counter reads
  private hCounterReads: number = 0;
  private vCounterReads: number = 0;
  private hCounterHist: Uint32Array = new Uint32Array(256);
  // VDP mirror write counters for 0xBE/0xBF
  private vdpDataWrites: number = 0; // 0xBE
  private vdpCtrlWrites: number = 0; // 0xBF
  // Minimal YM2413 (FM) stub: expose presence/enable ports without audio implementation
  private fmEnabled: boolean = false;

  constructor(
    cart: Cartridge,
    vdp?: IVDP | null,
    psg?: IPSG | null,
    controller1?: IController | null,
    controller2?: IController | null,
    opts?: (BusOptions & { bios?: Uint8Array | null }) | null
  ) {
    this.mapper = new SegaMapper(cart.rom);
    // Pass WRAM reference to mapper for RAM mirroring
    if (this.mapper.setWramRef) {
      this.mapper.setWramRef(this.wram);
    }
    this.vdp = vdp ?? null;
    this.psg = psg ?? null;
    this.controller1 = controller1 ?? null;
    this.controller2 = controller2 ?? null;
    this.allowCartRam = opts?.allowCartRam ?? true;
    this.bios = opts?.bios ?? null;
    // If no BIOS supplied, disable BIOS mapping
    if (!this.bios) this.biosEnabled = false;
  }

  public read8 = (addr: number): number => {
    const a = addr & 0xffff;
    // BIOS overlay typically maps only the first 16KB (0x0000-0x3FFF). Do NOT shadow system RAM (0xC000-0xFFFF).
    if (this.biosEnabled && this.bios && a < 0x4000) {
      const idx = a % this.bios.length; // mirror BIOS over its own length
      return this.bios[idx]!;
    }
    if (a < 0xc000) {
      // 0x0000-0xBFFF region: may include optional cart RAM mapping at 0x8000-0xBFFF
      if (a >= 0x8000 && this.cartRamEnabled) {
        return this.cartRam[a - 0x8000]!;
      }
      return this.mapper.mapRead(a);
    }
    // WRAM 0xc000-0xdfff, mirror 0xe000-0xffff
    const waddr = (a - 0xc000) & 0x1fff;
    return this.wram[waddr]!;
  };

  public write8 = (addr: number, val: number): void => {
    const a = addr & 0xffff;
    const v = val & 0xff;
    // Optional debug: log writes to specific addresses provided via DEBUG_STACK_ADDRS (comma-separated hex)
    // This is used by tools to track stack corruption without affecting release builds
    try {
      const dbg = (typeof process !== 'undefined' && (process as any).env && (process as any).env.DEBUG_STACK_ADDRS) ? String((process as any).env.DEBUG_STACK_ADDRS) : '';
      if (dbg) {
        const set = new Set(dbg.split(',').map((s)=>parseInt(s.trim(),16)&0xffff));
        if (set.has(a)) {
          // eslint-disable-next-line no-console
          console.log(`bus.write8 a=${a.toString(16).toUpperCase().padStart(4,'0')} v=${v.toString(16).toUpperCase().padStart(2,'0')}`);
        }
      }
    } catch {}
    if (a >= 0xfffc) {
      try {
        if ((process as any).env && (process as any).env.DEBUG_IO_LOG && ((process as any).env.DEBUG_IO_LOG as string) !== '0') {
          // eslint-disable-next-line no-console
          console.log(`mem-dbg WRITE ${a.toString(16).toUpperCase().padStart(4,'0')} <= ${v.toString(16).toUpperCase().padStart(2,'0')}`);
        }
      } catch {}
      // Some SMS BIOS variants also mirror memory-control bits via 0xFFFC.
      // Honor bit2 here as a BIOS-disable hint to better match observed boot flows in traces.
      if (a === 0xfffc && this.bios) {
        const prev = this.biosEnabled;
        // One-way BIOS disable mirror: if bit2 set, disable overlay; clearing bit2 does NOT re-enable
        if ((v & 0x04) !== 0) this.biosEnabled = false;
        if (prev !== this.biosEnabled) {
          try {
            if ((process as any).env && (process as any).env.DEBUG_IO_LOG && ((process as any).env.DEBUG_IO_LOG as string) !== '0') {
              // eslint-disable-next-line no-console
              console.log(`bios-mirror: 0xFFFC=${v.toString(16).toUpperCase().padStart(2,'0')} -> biosEnabled=${this.biosEnabled?1:0}`);
            }
          } catch {}
        }
      }
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

  public readIO8 = (port: number): number => {
    const p = port & 0xff;
    const low6 = p & 0x3f;
    // H/V counters (reads) are on 0x7E/0x7F; PSG is write-only on 0x7F
    if (this.vdp && (p === 0x7e || p === 0x7f)) {
      const v = this.vdp.readPort(p) & 0xff;
      if (p === 0x7e) {
        this.hCounterReads++;
        const idx = v & 0xff;
        this.hCounterHist[idx] = ((this.hCounterHist[idx] ?? 0) + 1) >>> 0;
      } else {
        this.vCounterReads++;
      }
      return v;
    }

    // Minimal FM stub ports: read as if no FM chip present
    if (p === 0xf2) {
      // Return 0 indicates "no FM" in some detection schemes; adjust if needed
      return 0x00;
    }
    if (p === 0xf0 || p === 0xf1) {
      // FM data/status ports not implemented; return open-bus style 0xFF
      return 0xff;
    }

    // Controller ports 0xDC/0xDD (active-low): default 0xFF (no buttons pressed)
    if (p === 0xdc || p === 0xdd) {
      // Get controller state from the controller interface
      const controller = p === 0xdc ? this.controller1 : this.controller2;
      let val = controller ? controller.readPort() : 0xff;

      // Drive lower 6 lines according to direction/output latch (conservative model)
      const lowerMask = this.ioDirMask & 0x3f;
      val = (val & ~lowerMask) | (this.ioOutLatch & lowerMask);

      // TH lines (bit 6) are driven from 0x3F upper bits; treat them as outputs for handshake
      if (p === 0xdc) {
        // Port A TH on bit 6
        if (this.thALatch) val |= 0x40;
        else val &= ~0x40;
      } else {
        // Port B TH on bit 6
        if (this.thBLatch) val |= 0x40;
        else val &= ~0x40;
      }
      return val & 0xff;
    }
    // I/O control and memory control reads typically undefined; return 0xFF
    if (p === 0x3f || p === 0x3e) return 0xff;
    // VDP mirrors across IO space: any port with low 6 bits 0x3e/0x3f maps to 0xbe/0xbf
    // Exclude real I/O control/mem control ports (0x3E/0x3F)
    if (this.vdp && (low6 === 0x3e || low6 === 0x3f) && p !== 0x3e && p !== 0x3f) {
      return this.vdp.readPort((p & 1) === 0 ? 0xbe : 0xbf);
    }
    return 0xff;
  };

  public writeIO8 = (port: number, val: number): void => {
    const p = port & 0xff;
    const low6 = p & 0x3f;
    const v = val & 0xff;
    // PSG on 0x7f (write-only) — must take precedence over VDP mirror on 0x3f low6
    if (p === 0x7f) {
      this.lastPSG = v;
      if (this.psg) this.psg.write(v);
      return;
    }
    // I/O control and memory control ports
    if (p === 0x3f) {
      const prev = this.ioControl & 0xff;
      this.ioControl = v;
      // Lower 6 bits: direction mask for controller lines (1=output)
      this.ioDirMask = v & 0x3f;
      // Upper bits drive TH line latches: bit6 -> TH-A, bit7 -> TH-B
      this.thALatch = v & 0x40 ? 1 : 0;
      this.thBLatch = v & 0x80 ? 1 : 0;
      // Keep generic lower-line outputs default pulled high unless explicitly modeled elsewhere
      this.ioOutLatch |= 0x3f;
      try {
        if ((process as any).env && (process as any).env.DEBUG_IO_LOG && ((process as any).env.DEBUG_IO_LOG as string) !== '0') {
          // eslint-disable-next-line no-console
          console.log(`io-dbg OUT port=3F val=${v.toString(16).toUpperCase().padStart(2,'0')} prev=${prev.toString(16).toUpperCase().padStart(2,'0')}`);
        }
      } catch {}
      return;
    }
    if (p === 0x3e) {
      const prevMC = this.memControl & 0xff;
      const prevBios = this.biosEnabled;
      this.memControl = v;
      // Enable optional cartridge RAM mapping at 0x8000-0xBFFF when bit3 is set and bus allows it.
      this.cartRamEnabled = this.allowCartRam && (v & 0x08) !== 0;
      // BIOS disable bit (bit 2). One-way: setting disables overlay; clearing does NOT re-enable.
      if (this.bios && (v & 0x04) !== 0) this.biosEnabled = false;
      try {
        if ((process as any).env && (process as any).env.DEBUG_IO_LOG && ((process as any).env.DEBUG_IO_LOG as string) !== '0') {
          // eslint-disable-next-line no-console
          console.log(
            `io-dbg OUT port=3E val=${v.toString(16).toUpperCase().padStart(2,'0')} memCtrl:${prevMC.toString(16).toUpperCase().padStart(2,'0')}->${this.memControl.toString(16).toUpperCase().padStart(2,'0')} bios:${prevBios?1:0}->${this.biosEnabled?1:0} cartRAM:${this.cartRamEnabled?1:0}`
          );
        }
      } catch {}
      return;
    }
    // Minimal FM control (0xF2): accept writes to enable/disable flag and ignore silently
    if (p === 0xf2) {
      // Bit 7 often used as enable; treat non-zero as attempt to enable FM, but we ignore audio path
      this.fmEnabled = (v & 0x80) !== 0;
      return;
    }
    // Ignore writes to FM data/addr ports (0xF0, 0xF1)
    if (p === 0xf0 || p === 0xf1) {
      return;
    }
    // VDP mirrors across IO space: any port with low 6 bits 0x3e/0x3f maps to 0xbe/0xbf
    // Exclude real I/O control/mem control ports (0x3E/0x3F)
    if (this.vdp && (low6 === 0x3e || low6 === 0x3f)) {
      if ((p & 1) === 0) {
        this.vdp.writePort(0xbe, v);
        this.vdpDataWrites++;
      } else {
        this.vdp.writePort(0xbf, v);
        this.vdpCtrlWrites++;
      }
      return;
    }
  };

  // Test helpers
  public getWram = (): Uint8Array => this.wram;
  public getLastPSG = (): number => this.lastPSG;
  public getIOControl = (): number => this.ioControl;
  public getMemControl = (): number => this.memControl;

  // Debug helper: summarize HCounter reads histogram
  public getHCounterStats = (): { total: number; vreads: number; top: Array<{ value: number; count: number }> } => {
    const res: Array<{ value: number; count: number }> = [];
    for (let i = 0; i < 256; i++) {
      const c = this.hCounterHist[i];
      if (c) res.push({ value: i, count: c });
    }
    res.sort((a, b) => b.count - a.count);
    return { total: this.hCounterReads, vreads: this.vCounterReads, top: res.slice(0, 8) };
  };

  public getVDPWriteStats = (): { data: number; control: number } => ({
    data: this.vdpDataWrites,
    control: this.vdpCtrlWrites,
  });
  // Test helper to configure conservative IO mask explicitly
  public __setIOMaskForTest = (dirMask: number, outLatch: number): void => {
    this.ioDirMask = dirMask & 0xff;
    this.ioOutLatch = outLatch & 0xff;
  };

  // ROM bank getters for debugging
  public getROMBank = (slot: number): number => {
    if (this.mapper instanceof SegaMapper) {
      // Access private fields via any cast (for debugging only)
      const m = this.mapper as any;
      if (slot === 0) return m.bank0 ?? 0;
      if (slot === 1) return m.bank1 ?? 1;
      if (slot === 2) return m.bank2 ?? 2;
    }
    return 0;
  };
}

// Backwards-compat simple RAM-only bus for earlier util tests
export class SimpleBus implements IBus {
  private readonly mem: Uint8Array;
  constructor(size: number = 0x10000) {
    this.mem = new Uint8Array(size);
  }
  public getMemory = (): Uint8Array => this.mem;
  public read8 = (addr: number): number => this.mem[addr & 0xffff]!;
  public write8 = (addr: number, val: number): void => {
    this.mem[addr & 0xffff] = val & 0xff;
  };
  public readIO8 = (port: number): number => {
    void port;
    return 0xff;
  };
  public writeIO8 = (port: number, val: number): void => {
    void port;
    void val;
  };
}
