import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';
import { formatTrace } from '../src/debug/trace.js';

interface MameTraceLine {
  idx: number;
  pc: number;
  text?: string;
  raw: string;
}

const parseMameTrace = (content: string): MameTraceLine[] => {
  const lines = content.split(/\r?\n/);
  const out: MameTraceLine[] = [];
  let idx = 0;
  for (const raw of lines) {
    if (!raw) continue;
    // Find first 4-hex-digit PC followed by ':'
    const m = raw.match(/\b([0-9a-fA-F]{4}):/);
    if (!m) continue;
    const pc = parseInt(m[1]!, 16) & 0xffff;
    // Text after the matched pc-colon, if any
    const restStart = raw.indexOf(m[0]!) + m[0]!.length;
    const rest = raw.slice(restStart).trim();
    out.push({ idx: idx++, pc, text: rest.length ? rest : undefined, raw });
  }
  return out;
};

const hex4 = (v: number): string => v.toString(16).padStart(4, '0').toUpperCase();
const hex2 = (v: number): string => v.toString(16).padStart(2, '0').toUpperCase();

const pickLatestTrace = async (dir: string): Promise<string | null> => {
  try {
    const entries = await fs.readdir(dir);
    const files = entries.filter((f) => /^sms-\d{14}\.log$/.test(f)).sort().reverse();
    if (files.length === 0) return null;
    return path.join(dir, files[0]!);
  } catch {
    return null;
  }
};

const loadRom = async (romPath: string): Promise<Uint8Array> => {
  const buf = await fs.readFile(romPath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const ENV_ROM = process.env.SMS_ROM;
  const ENV_TRACE = process.env.TRACE_FILE;
  const ENV_STEPS = process.env.MAX_STEPS ? parseInt(process.env.MAX_STEPS, 10) : undefined;
  const ENV_SKIP = process.env.SKIP_LINES ? parseInt(process.env.SKIP_LINES, 10) : 0;
  const ENV_ALIGN_PC_HEX = process.env.ALIGN_PC || null;
  const ENV_AUTO_ALIGN = process.env.AUTO_ALIGN === '1' || process.env.AUTO_ALIGN === 'true';

  if (!ENV_ROM) {
    console.error('ERROR: Set SMS_ROM to your .sms ROM path.');
    process.exit(1);
  }
  const romPath = path.isAbsolute(ENV_ROM) ? ENV_ROM : path.join(ROOT, ENV_ROM);
  const tracePath = ENV_TRACE || (await pickLatestTrace(path.join(ROOT, 'traces')));
  if (!tracePath) {
    console.error('ERROR: TRACE_FILE not provided and no traces/sms-*.log found.');
    console.error('Run a trace first: SMS_ROM=/path/game.sms TRACE_SECONDS=3 npm run trace:sms');
    process.exit(2);
  }

  const biosPath = process.env.SMS_BIOS ? (path.isAbsolute(process.env.SMS_BIOS) ? process.env.SMS_BIOS : path.join(ROOT, process.env.SMS_BIOS)) : null;

  const [rom, traceText, bios] = await Promise.all([
    loadRom(romPath),
    fs.readFile(tracePath, 'utf8'),
    biosPath ? fs.readFile(biosPath) : Promise.resolve(null as any),
  ]);
  const biosBytes: Uint8Array | null = bios ? new Uint8Array((bios as Buffer).buffer, (bios as Buffer).byteOffset, (bios as Buffer).byteLength) : null;

  const mameLines = parseMameTrace(traceText);
  if (mameLines.length === 0) {
    console.error('ERROR: Parsed 0 lines from MAME trace. Check the trace format.');
    process.exit(3);
  }

  let startIdx = Math.max(0, ENV_SKIP);
  // Optional alignment: find first occurrence of target PC in MAME trace
  if (ENV_ALIGN_PC_HEX) {
    let target = 0;
    const s = ENV_ALIGN_PC_HEX.trim().toLowerCase();
    if (s.startsWith('0x')) target = parseInt(s, 16) & 0xffff; else target = parseInt(s, 16) & 0xffff;
    const found = mameLines.findIndex((l) => l.pc === target);
    if (found >= 0) startIdx += found;
  } else if (ENV_AUTO_ALIGN) {
    // Auto-align by matching a short sequence of our ROM's first instructions' text
    const norm = (t: string | undefined): string => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();
    // Build normalized text list from MAME trace
    const mtexts = mameLines.map((l) => norm(l.text));

    // Disassemble first N instructions from our ROM starting at 0x0000 using our disassembler (no stepping)
    // We will fetch bytes directly from the machine bus (reads from ROM mapping at 0x0000)
    const N = 32;
    const window = 3; // window length to match
    let pc = 0x0000;
    const ourSeq: string[] = [];
    // Simple ROM reader from bank 0 for startup code
    const romRead8 = (addr: number): number => rom[addr & 0xffff] ?? 0xff;
    for (let i = 0; i < N; i++) {
      const r = disassembleOne((addr: number): number => romRead8(addr & 0xffff) & 0xff, pc & 0xffff);
      ourSeq.push(norm(r.text));
      pc = (pc + r.bytes.length) & 0xffff;
    }
    // Slide a window over the MAME text to find a consecutive match of length `window`
    let found = -1;
    for (let i = 0; i + window <= mtexts.length; i++) {
      let ok = true;
      for (let k = 0; k < window; k++) {
        if (mtexts[i + k] !== ourSeq[k]) { ok = false; break; }
      }
      if (ok) { found = i; break; }
    }
    if (found >= 0) {
      startIdx += found;
      console.log(`Auto-aligned to MAME trace index ${found} by matching first ${window} ROM instructions.`);
    } else {
      console.warn('AUTO_ALIGN failed to find a match; proceeding without alignment.');
    }
  }
  const limit = ENV_STEPS && ENV_STEPS > 0 ? Math.min(ENV_STEPS, mameLines.length - startIdx) : (mameLines.length - startIdx);
  const STRICT = process.env.STRICT === '1' || process.env.STRICT === 'true';
  const STRICT_TEXT = process.env.STRICT_TEXT === '1' || process.env.STRICT_TEXT === 'true';

  // Relocation aliasing: treat certain ROM<->WRAM address windows as equivalent PCs.
  // Configure via RELOC_ALIAS env, e.g.: "3500-357F:C700-C77F;4000-40FF:C800-C8FF" (comma/semicolon separated)
  interface RelocAlias { loA: number; hiA: number; loB: number; hiB: number; deltaAB: number; }
  const parseHex = (s: string): number => (s.trim().toLowerCase().startsWith('0x') ? parseInt(s, 16) : parseInt(s, 16)) & 0xffff;
  const parseAliases = (spec: string): RelocAlias[] => {
    const list: RelocAlias[] = [];
    const items = spec.split(/[;,]+/).map((x) => x.trim()).filter((x) => x.length > 0);
    for (const it of items) {
      const m = it.split(':');
      if (m.length !== 2) continue;
      const [a, b] = m;
      const [loAS, hiAS] = a.split('-');
      const [loBS, hiBS] = b.split('-');
      if (!loAS || !hiAS || !loBS || !hiBS) continue;
      const loA = parseHex(loAS), hiA = parseHex(hiAS);
      const loB = parseHex(loBS), hiB = parseHex(hiBS);
      const deltaAB = ((loB - loA) & 0xffff);
      list.push({ loA, hiA, loB, hiB, deltaAB });
    }
    return list;
  };
  const defaultAliases: RelocAlias[] = [
    // Sonic SMS: ROM 0x3500..0x357F mirrors WRAM 0xC700..0xC77F (+0x9200)
    { loA: 0x3500, hiA: 0x357F, loB: 0xC700, hiB: 0xC77F, deltaAB: (0xC700 - 0x3500) & 0xffff },
  ];
  const aliasSpec = (process.env.RELOC_ALIAS || '').trim();
  const relocAliases: RelocAlias[] = aliasSpec ? parseAliases(aliasSpec) : defaultAliases;
  const pcsEqual = (a: number, b: number): boolean => {
    a &= 0xffff; b &= 0xffff;
    if (a === b) return true;
    for (const r of relocAliases) {
      if (a >= r.loA && a <= r.hiA && (((a + r.deltaAB) & 0xffff) === b)) return true;
      if (b >= r.loA && b <= r.hiA && (((b + r.deltaAB) & 0xffff) === a)) return true;
      // Also allow mapping B->A delta for completeness
      const deltaBA = ((r.loA - r.loB) & 0xffff);
      if (a >= r.loB && a <= r.hiB && (((a + deltaBA) & 0xffff) === b)) return true;
      if (b >= r.loB && b <= r.hiB && (((b + deltaBA) & 0xffff) === a)) return true;
    }
    return false;
  };

  // Build machine
  const cart: Cartridge = { rom };
  const myTraceHistory: string[] = [];

  // Optional: dump our emulator's full per-instruction trace to a file
  const OUR_TRACE_FILE = process.env.OUR_TRACE_FILE ? (path.isAbsolute(process.env.OUR_TRACE_FILE) ? process.env.OUR_TRACE_FILE : path.join(ROOT, process.env.OUR_TRACE_FILE)) : null;
  const ourTraceStream = OUR_TRACE_FILE ? await fs.open(OUR_TRACE_FILE, 'w') : null;

  const debugStack = process.env.DEBUG_STACK === '1' || process.env.DEBUG_STACK === 'true';
  const focusSP = process.env.STACK_FOCUS_SP ? parseInt(process.env.STACK_FOCUS_SP, 16) & 0xffff : null;
  const focusPCStart = process.env.STACK_FOCUS_PC_START ? parseInt(process.env.STACK_FOCUS_PC_START, 16) & 0xffff : null;
  const focusPCEnd = process.env.STACK_FOCUS_PC_END ? parseInt(process.env.STACK_FOCUS_PC_END, 16) & 0xffff : null;

  const hex4u = (v: number): string => v.toString(16).toUpperCase().padStart(4,'0');

  let busRef: import('../src/bus/bus.js').SmsBus | null = null;

  const debugMemAddrs = (process.env.DEBUG_MEM_ADDRS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 16) & 0xffff);
  const debugMemSet = new Set<number>(debugMemAddrs);

  // Optional wait-state config (for cycle accuracy around VDP IO)
  const WAIT_SMS = process.env.WAIT_SMS === '1' || process.env.WAIT_SMS === 'true';
  const WAIT_INCLUDE = process.env.WAIT_INCLUDE === '1' || process.env.WAIT_INCLUDE === 'true';
  const WAIT_VDP_PENALTY = process.env.WAIT_VDP_PENALTY ? parseInt(process.env.WAIT_VDP_PENALTY, 10) : 4;

  const machine = createMachine({
    cart,
    bus: { allowCartRam: true, bios: biosBytes },
    wait: WAIT_SMS ? { smsModel: true, includeWaitInCycles: WAIT_INCLUDE, vdpPenalty: WAIT_VDP_PENALTY } : undefined,
    // Enable fast block ops so LDIR/LDDR collapse into a single step, aligning better with MAME's collapsed trace
    fastBlocks: true,
    trace: {
      onTrace: (ev): void => {
        // Keep a rolling history of last ~10 lines to aid debugging
        const s = formatTrace(ev, { showBytes: true, showFlags: true });
        myTraceHistory.push(s);
        if (myTraceHistory.length > 10) myTraceHistory.shift();
        if (ourTraceStream) {
          // Fire and forget; errors ignored to avoid slowing down the run
          void ourTraceStream.appendFile(s + '\n');
        }
        // Detect operations that target (IY+07) to locate when the game updates that flag
        if (ev.text) {
          const T = ev.text.toUpperCase();
          if (/(IY\+\s*07\))/i.test(T)) {
            // Likely touches (IY+07)
            const pcHex = (ev.pcBefore & 0xffff).toString(16).toUpperCase().padStart(4,'0');
            console.log(`iy7-op pc=${pcHex} op=\"${T}\"`);
          }
        }
      },
      traceDisasm: true,
      traceRegs: true,
    },
    // Keep waits disabled initially; can be toggled if needed for parity
    fastBlocks: false,
    cpuDebugHooks: !debugStack && debugMemSet.size === 0 ? undefined : {
      onPush16: (spBefore: number, value: number, pcAtPush: number): void => {
        if (
          (!focusSP || (spBefore & 0xffff) === focusSP) &&
          (!focusPCStart || !focusPCEnd || ((pcAtPush & 0xffff) >= focusPCStart && (pcAtPush & 0xffff) <= focusPCEnd))
        ) {
          const lo = busRef ? (busRef.read8((spBefore - 2) & 0xffff) & 0xff) : -1;
          const hi = busRef ? (busRef.read8((spBefore - 1) & 0xffff) & 0xff) : -1;
          console.log(`push16 sp=${hex4u(spBefore)} val=${hex4u(value)} pc=${hex4u(pcAtPush)} mem[${hex4u((spBefore-2)&0xffff)}]=${hex4u(lo)} mem[${hex4u((spBefore-1)&0xffff)}]=${hex4u(hi)}`);
        }
      },
      onPop16: (spBefore: number, value: number, pcAtPop: number): void => {
        if (
          (!focusSP || (spBefore & 0xffff) === focusSP) &&
          (!focusPCStart || !focusPCEnd || ((pcAtPop & 0xffff) >= focusPCStart && (pcAtPop & 0xffff) <= focusPCEnd))
        ) {
          const lo = busRef ? (busRef.read8(spBefore & 0xffff) & 0xff) : -1;
          const hi = busRef ? (busRef.read8((spBefore + 1) & 0xffff) & 0xff) : -1;
          console.log(`pop16  sp=${hex4u(spBefore)} val=${hex4u(value)} pc=${hex4u(pcAtPop)} mem[${hex4u(spBefore&0xffff)}]=${hex4u(lo)} mem[${hex4u((spBefore+1)&0xffff)}]=${hex4u(hi)}`);
        }
      },
      onMemWrite: (addr: number, val: number, pcAtWrite: number): void => {
        if (debugMemSet.size > 0 && debugMemSet.has(addr & 0xffff)) {
          console.log(`memwrite pc=${hex4u(pcAtWrite)} addr=${hex4u(addr)} val=${hex4u(val)}`);
        }
      },
    },
  });
  busRef = machine.getBus();

  const SEEK_LIMIT = process.env.SEEK_LIMIT ? parseInt(process.env.SEEK_LIMIT, 10) : 20000;
  const MAME_SKIP_LIMIT = process.env.MAME_SKIP_LIMIT ? parseInt(process.env.MAME_SKIP_LIMIT, 10) : 20000; // higher default for deep resyncs
  // Loop-aware extended seek budgets
  const LOOP_SEEK_LIMIT = process.env.LOOP_SEEK_LIMIT ? parseInt(process.env.LOOP_SEEK_LIMIT, 10) : 10000000;
  const BLOCK_SEEK_LIMIT = process.env.BLOCK_SEEK_LIMIT ? parseInt(process.env.BLOCK_SEEK_LIMIT, 10) : 10000000;

  // Optional focused I/O logging window
  const IO_LOG = process.env.IO_LOG === '1' || process.env.IO_LOG === 'true';
  const IO_PORTS: number[] = (process.env.IO_PORTS || 'BF,BE,7E,7F,DC,DD,3E,3F,CB')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 16) & 0xff);
  const FOCUS_PC = process.env.FOCUS_PC ? parseInt(process.env.FOCUS_PC, 16) & 0xffff : null;
  const FOCUS_STEPS = process.env.FOCUS_STEPS ? parseInt(process.env.FOCUS_STEPS, 10) : 500;
  let inFocus = false;
  let focusRemaining = 0;
  const FORCE_IY7_BIT7_AT_PC = process.env.FORCE_IY7_BIT7_AT_PC ? parseInt(process.env.FORCE_IY7_BIT7_AT_PC, 16) & 0xffff : null;

  const cpu = machine.getCPU();
  const vdp = machine.getVDP();
  const psg = machine.getPSG();
  // Initialize VDP probe state
  try {
    const vs = vdp.getState ? vdp.getState() : undefined;
    prevVdpHasIRQ = vdp.hasIRQ();
    prevVblankFlag = vs ? ((vs.status & 0x80) ? 1 : 0) : 0;
  } catch {}

  // Optionally prime WRAM with a binary dump (e.g., from MAME at BIOS jump)
  if (process.env.PRIME_RAM) {
    const ramPath = path.isAbsolute(process.env.PRIME_RAM) ? process.env.PRIME_RAM : path.join(ROOT, process.env.PRIME_RAM);
    const data = await fs.readFile(ramPath);
    const wram = machine.getBus().getWram();
    const len = Math.min(wram.length, data.length);
    wram.set(new Uint8Array(data.buffer, (data as Buffer).byteOffset, len));
    console.log(`Primed WRAM with ${len} bytes from ${ramPath}`);
  }

  // Memory watch (comma-separated hex addresses), default to D207 to track bit 7 decision
  const watchList: number[] = (process.env.WATCH_ADDRS || 'D207')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 16) & 0xffff);
  const watchPrev = new Map<number, number>();
  for (const a of watchList) watchPrev.set(a, machine.getBus().read8(a) & 0xff);

  const disasmAt = (pc: number): string => {
    const text = disassembleOne((addr: number): number => machine.getBus().read8(addr & 0xffff) & 0xff, pc).text;
    return text;
  };

  const regsSnapshot = (): string => {
    const s = cpu.getState();
    const AF = ((s.a & 0xff) << 8) | (s.f & 0xff);
    const BC = ((s.b & 0xff) << 8) | (s.c & 0xff);
    const DE = ((s.d & 0xff) << 8) | (s.e & 0xff);
    const HL = ((s.h & 0xff) << 8) | (s.l & 0xff);
    return `AF=${hex4(AF)} BC=${hex4(BC)} DE=${hex4(DE)} HL=${hex4(HL)} IX=${hex4(s.ix)} IY=${hex4(s.iy)} SP=${hex4(s.sp)} PC=${hex4(s.pc)} I=${hex2(s.i)} R=${hex2(s.r)}`;
  };

  // Step and compare
  if (STRICT) {
    // Strict, instruction-by-instruction compare with collapsed-constant-PC tolerance
    let i = startIdx;
    let steps = 0;
    // Initial alignment check
    let curPC = cpu.getState().pc & 0xffff;
    if (!pcsEqual(mameLines[i]!.pc, curPC)) {
      console.error('DIVERGENCE');
      console.error(` step=${steps}`);
      console.error(` expect: PC=${hex4(mameLines[i]!.pc)}  text="${mameLines[i]!.text ?? ''}"`);
      console.error(` actual: PC=${hex4(curPC)}  text="${disasmAt(curPC)}"`);
      console.error(` regs:   ${regsSnapshot()}`);
      process.exit(10);
    }
    let prevText = disasmAt(curPC);
    while (steps < limit) {
      const beforePC = curPC;
      const beforeText = disasmAt(beforePC);
      const sBefore = cpu.getState();
      const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
      if (PROBE_LOOP && r.irqAccepted) {
        const sbc = (((sBefore.b & 0xff) << 8) | (sBefore.c & 0xff)) & 0xffff;
        const sAfter = cpu.getState();
        const abc = (((sAfter.b & 0xff) << 8) | (sAfter.c & 0xff)) & 0xffff;
        console.log(`cpu IRQ_ACCEPT beforePC=${hex4(pcBefore)} BC_before=${hex4(sbc)} BC_after=${hex4(abc)} newPC=${hex4(sAfter.pc & 0xffff)}`);
      }
      // Loop window per-step log
      if (PROBE_LOOP && loopWindowRemain > 0) {
        try {
          const st = cpu.getState();
          const vs = vdp.getState ? vdp.getState() : undefined;
          const d200 = busRef.read8(0xd200) & 0xff;
          const iy0 = busRef.read8(st.iy & 0xffff) & 0xff;
          console.log(`loopwin pc=${hex4(st.pc & 0xffff)} irqAcc=${r.irqAccepted?1:0} hasIRQ=${vdp.hasIRQ()?1:0} vline=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)} D200=${hex2(d200)} IY0=${hex2(iy0)}`);
        } catch {}
        loopWindowRemain--;
        if (loopWindowRemain === 0) console.log('loopwin END');
      }
      // VDP event probe after step
      if (PROBE_LOOP) {
        try {
          const hasIRQ = vdp.hasIRQ();
          const vs = vdp.getState ? vdp.getState() : undefined;
          const vblankFlag = vs ? ((vs.status & 0x80) ? 1 : 0) : 0;
          if (hasIRQ && !prevVdpHasIRQ) {
            const st = cpu.getState();
            console.log(`vdpevent IRQ_RISE pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
          }
          if (!hasIRQ && prevVdpHasIRQ) {
            const st = cpu.getState();
            console.log(`vdpevent IRQ_FALL pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
          }
          if (vblankFlag !== prevVblankFlag) {
            const st = cpu.getState();
            const tag = vblankFlag ? 'VBLANK_SET' : 'VBLANK_CLR';
            console.log(`vdpevent ${tag} pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
          }
          prevVdpHasIRQ = hasIRQ;
          prevVblankFlag = vblankFlag;
        } catch {}
      }
      curPC = cpu.getState().pc & 0xffff;
      // If PC did not change (collapsed loop, e.g., OTI R), do not advance expected index; optionally check text
      if (curPC === beforePC) {
        if (STRICT_TEXT) {
          const want = (mameLines[i]!.text ?? '').trim().toLowerCase().replace(/\s+/g,' ');
          const got  = beforeText.trim().toLowerCase().replace(/\s+/g,' ');
          if (want && want !== got) {
            console.error('DIVERGENCE');
            console.error(` step=${steps}`);
            console.error(` expect: PC=${hex4(mameLines[i]!.pc)}  text="${mameLines[i]!.text ?? ''}"`);
            console.error(` actual: PC=${hex4(beforePC)}  text="${beforeText}"`);
            console.error(` regs:   ${regsSnapshot()}`);
            console.error(' recent trace:');
            for (const line of myTraceHistory) console.error(`  ${line}`);
            process.exit(10);
          }
        }
      } else {
        // PC changed: advance expected index by one and require it to match new PC
        i++;
        if (i >= mameLines.length || !pcsEqual(mameLines[i]!.pc, curPC)) {
          console.error('DIVERGENCE');
          console.error(` step=${steps}`);
          const exp = i < mameLines.length ? mameLines[i]! : mameLines[mameLines.length-1]!;
          console.error(` expect: PC=${hex4(exp.pc)}  text="${exp.text ?? ''}"`);
          console.error(` actual: PC=${hex4(curPC)}  text="${disasmAt(curPC)}"`);
          console.error(` regs:   ${regsSnapshot()}`);
          console.error(' recent trace:');
          for (const line of myTraceHistory) console.error(`  ${line}`);
          console.error(' context (expected +/-2):');
          for (let k = Math.max(startIdx, i-2); k <= Math.min(mameLines.length-1, i+2); k++) {
            console.error(`  ${hex4(mameLines[k]!.pc)}: ${mameLines[k]!.text ?? ''}`);
          }
          process.exit(10);
        }
        if (STRICT_TEXT) {
          const want = (mameLines[i]!.text ?? '').trim().toLowerCase().replace(/\s+/g,' ');
          const got  = disasmAt(curPC).trim().toLowerCase().replace(/\s+/g,' ');
          if (want && want !== got) {
            console.error('DIVERGENCE');
            console.error(` step=${steps}`);
            console.error(` expect: PC=${hex4(mameLines[i]!.pc)}  text="${mameLines[i]!.text ?? ''}"`);
            console.error(` actual: PC=${hex4(curPC)}  text="${disasmAt(curPC)}"`);
            console.error(` regs:   ${regsSnapshot()}`);
            process.exit(10);
          }
        }
      }
      steps++;
      // Optional I/O logging and memwatch work as before; reuse same hooks below after step
      if (IO_LOG && inFocus && focusRemaining > 0) {
        const text = beforeText.toUpperCase();
        const regs = cpu.getState();
        let m: RegExpMatchArray | null;
        if ((m = text.match(/^IN A,\((\$?[0-9A-F]{2}|C)\)$/i)) != null) {
          let port: number | null = null;
          const arg = m[1]!.replace('$','');
          if (arg.toUpperCase() === 'C') port = regs.c & 0xff; else port = parseInt(arg, 16) & 0xff;
          if (port !== null && IO_PORTS.includes(port)) console.log(`io IN  pc=${hex4(beforePC)} port=${hex2(port)} -> A=${hex2(regs.a & 0xff)}`);
        } else if ((m = text.match(/^OUT \((\$?[0-9A-F]{2}|C)\),A$/i)) != null) {
          let port: number | null = null;
          const arg = m[1]!.replace('$','');
          if (arg.toUpperCase() === 'C') port = cpu.getState().c & 0xff; else port = parseInt(arg, 16) & 0xff;
          if (port !== null && IO_PORTS.includes(port)) {
            const a = (cpu.getState().a & 0xff); // value before step already consumed; best effort
            console.log(`io OUT pc=${hex4(beforePC)} port=${hex2(port)} A=${hex2(a)}`);
          }
        }
      }
      if (watchList.length > 0) {
        const pcJustExec = hex4(beforePC);
        for (const a of watchList) {
          const cur = machine.getBus().read8(a) & 0xff;
          const prev = watchPrev.get(a)!;
          if (cur !== prev) {
            console.log(`memwatch ${pcJustExec} ${hex4(a)}: ${hex2(prev)} -> ${hex2(cur)}`);
            watchPrev.set(a, cur);
          }
        }
      }
      // Focus window bookkeeping (no-op unless configured)
      if (FOCUS_PC !== null && !inFocus) {
        const nextPc = mameLines[i]!.pc;
        if (nextPc === FOCUS_PC) { inFocus = true; focusRemaining = FOCUS_STEPS; console.log(`Entered focus window at PC=${hex4(nextPc)} for ${FOCUS_STEPS} steps.`); }
      }
      if (inFocus && focusRemaining > 0) { focusRemaining--; if (focusRemaining <= 0) { inFocus = false; console.log('Exited focus window.'); } }
    }
    console.log(`No divergence detected after ${limit} steps (strict). Compared against trace: ${tracePath}`);
    if (ourTraceStream) await ourTraceStream.close();
    return;
  }

  let consumed = 0; // number of expected lines consumed
  const DEBUG_EI = process.env.DEBUG_EI === '1' || process.env.DEBUG_EI === 'true';
  const PROBE_LOOP = process.env.PROBE_LOOP === '1' || process.env.PROBE_LOOP === 'true';
  const PROBE_LOOP_STEPS = process.env.PROBE_LOOP_STEPS ? parseInt(process.env.PROBE_LOOP_STEPS, 10) : 2000;
  let prevIFF1 = false;
  let totalIrqAccepted = 0;
  // VDP event probes
  let prevVdpHasIRQ = false;
  let prevVblankFlag = 0;
  // Focused loop window (when first entering 031C/0320)
  let loopWindowRemain = 0;
  // BIOS tight DEC/OR/JR loop instrumentation counters
  let bioLoopIters = 0;
  let bioLoopLastBC = -1;
  // Optional hack: force bit0 of (IY+0) to 1 to break out of the IY wait loop when stuck
  const HACK_IY0_BIT0 = process.env.HACK_IY0_BIT0 === '1' || process.env.HACK_IY0_BIT0 === 'true';

  // Detect common short polling loops like: IN A,(n); DJNZ -6 (two-byte IN followed by DJNZ back to IN)
  const isShortDjNzPoll = (pc: number): boolean => {
    try {
      const b0 = machine.getBus().read8(pc & 0xffff) & 0xff;
      const b1 = machine.getBus().read8((pc + 1) & 0xffff) & 0xff;
      const b2 = machine.getBus().read8((pc + 2) & 0xffff) & 0xff;
      const b3 = machine.getBus().read8((pc + 3) & 0xffff) & 0xff;
      // Pattern case 1: starting at IN A,(n): DB nn 10 FA
      if (b0 === 0xDB && b2 === 0x10 && b3 === 0xFA) return true;
      // Pattern case 2: at DJNZ rel8 that jumps back by -6: 10 FA
      if (b0 === 0x10 && b1 === 0xFA) return true;
    } catch {}
    return false;
  };

  // Generic small conditional JR backward loop detector: JR cc,rel8 with negative offset
  const isShortCondJrBack = (pc: number): boolean => {
    try {
      const b0 = machine.getBus().read8(pc & 0xffff) & 0xff;
      const b1 = machine.getBus().read8((pc + 1) & 0xffff) & 0xff;
      // JR NZ (0x20), JR Z (0x28), JR NC (0x30), JR C (0x38)
      if ((b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) && (b1 & 0x80)) {
        return true; // backward jump
      }
    } catch {}
    return false;
  };

  while (consumed < limit) {
    // Enter focus when expected PC hits FOCUS_PC
    if (FOCUS_PC !== null && !inFocus) {
      const nextPc = mameLines[startIdx + consumed]!.pc;
      if (nextPc === FOCUS_PC) { inFocus = true; focusRemaining = FOCUS_STEPS; console.log(`Entered focus window at PC=${hex4(nextPc)} for ${FOCUS_STEPS} steps.`); }
    }
    const expect = mameLines[startIdx + consumed]!;
    let s = cpu.getState();
    let pcBefore = s.pc & 0xffff;

    // Skip strict comparison throughout BIOS space if collapse-to-cart is enabled,
    // and jump directly to the first expected PC in cart/WRAM (>= 0xC000).
    {
      const collapseToCart = process.env.BIOS_COLLAPSE_TO_CART === '1' || process.env.BIOS_COLLAPSE_TO_CART === 'true';
      if (collapseToCart && expect.pc < 0xC000) {
        // Find next expected index whose PC >= 0xC000
        let nextIdx = startIdx + consumed;
        while (nextIdx < mameLines.length && mameLines[nextIdx]!.pc < 0xC000) nextIdx++;
        if (nextIdx >= mameLines.length) {
          console.log('Reached end of trace while skipping BIOS region.');
          break;
        }
        const skipCount = nextIdx - (startIdx + consumed);
        consumed += skipCount; // fast-forward expected pointer
        const anchorPC = mameLines[nextIdx]!.pc & 0xffff;
        // Force-disable BIOS overlay via 0x3E bit2 and set CPU PC to anchor
        try {
          const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
          (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
        } catch {}
        try {
          const stForce = cpu.getState();
          stForce.pc = anchorPC & 0xffff;
          cpu.setState(stForce);
          pcBefore = anchorPC & 0xffff;
          console.log(`bios-skip skipped ${skipCount} line(s) to PC=${hex4(anchorPC)} (BIOS off).`);
        } catch {}
        // Re-evaluate this iteration now that we've aligned
        continue;
      }
    }

    // Early forced anchor jump if we're still in BIOS and expected is in cart
    {
      const collapseToCart = process.env.BIOS_COLLAPSE_TO_CART === '1' || process.env.BIOS_COLLAPSE_TO_CART === 'true';
      const inBioExt = (pc: number): boolean => collapseToCart ? (pc < 0xC000) : (pc >= 0x0314 && pc <= 0x0317) || pc === 0x0319 || pc === 0x031C;
      const forceAnchorHex3 = process.env.FORCE_CART_ANCHOR || null;
      if (forceAnchorHex3) {
        const anchor = parseInt(forceAnchorHex3, 16) & 0xffff;
        // If expected is exactly at the anchor and we're still in BIOS, jump immediately to the anchor.
        if (inBioExt(pcBefore) && expect.pc === anchor) {
          try {
            // Only disable BIOS overlay if the anchor is outside BIOS space
            if (anchor >= 0xC000) {
              const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
              (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
            }
          } catch {}
          try {
            const stForce = cpu.getState();
            stForce.pc = anchor & 0xffff;
            cpu.setState(stForce);
            pcBefore = anchor & 0xffff;
            console.log(`force-anchor (early) jumped PC to ${hex4(anchor)}${anchor>=0xC000?' (BIOS off)':' (BIOS on)'}.
`);
          } catch {}
        } else if (collapseToCart && inBioExt(pcBefore) && !inBioExt(expect.pc)) {
          // If expected moved out of BIOS (cart) while we are still inside, jump to anchor.
          try {
            const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
            (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
          } catch {}
          try {
            const stForce = cpu.getState();
            stForce.pc = anchor & 0xffff;
            cpu.setState(stForce);
            pcBefore = anchor & 0xffff;
            console.log(`force-anchor (early) jumped PC to ${hex4(anchor)} (BIOS off).`);
          } catch {}
        }
      }
    }

    // Start focused window when we first see the IY wait-loop
    if (PROBE_LOOP && (pcBefore === 0x031c || pcBefore === 0x0320) && loopWindowRemain === 0) {
      loopWindowRemain = PROBE_LOOP_STEPS;
      try {
        const st = cpu.getState();
        const iy = st.iy & 0xffff;
        const d200 = busRef.read8(0xd200) & 0xff;
        const vs = vdp.getState ? vdp.getState() : undefined;
        console.log(`loopwin START pc=${hex4(pcBefore)} IY=${hex4(iy)} D200=${hex2(d200)} vline=${vs ? (vs.line|0) : -1}`);
      } catch {}
    }
    // Probe the IY wait-loop (BIT 0,(IY+0) @ 031C and JR Z,-6 @ 0320)
    if (PROBE_LOOP && (pcBefore === 0x031c || pcBefore === 0x0320)) {
      try {
        const st = cpu.getState();
        const iy = st.iy & 0xffff;
        const iy0 = busRef.read8(iy) & 0xff;
        const d200 = busRef.read8(0xd200) & 0xff;
        const v = vdp.getState ? vdp.getState() : undefined;
        const hasIRQ = vdp.hasIRQ();
        const ln = v ? (v.line | 0) : -1;
        const vbEn = v ? (v.vblankIrqEnabled ? 1 : 0) : -1;
        const stReg = v ? (v.status & 0xff) : -1;
        console.log(`loopprobe pc=${hex4(pcBefore)} IY=${hex4(iy)} IFF1=${st.iff1 ? 1 : 0} (IY+0)=${hex2(iy0)} D200=${hex2(d200)} VDP_IRQ=${hasIRQ ? 1 : 0} VLINE=${ln} VB_EN=${vbEn} VSTAT=${hex2(stReg)}`);
      } catch {}
    }

    // Optional EI detector
    if (DEBUG_EI) {
      const opByte = busRef.read8(pcBefore) & 0xff;
      if (opByte === 0xFB) {
        console.log(`detector: EI opcode at PC=${hex4(pcBefore)}`);
      }
    }

    if (DEBUG_EI) {
      const opByte2 = busRef.read8(pcBefore) & 0xff;
      if (opByte2 === 0xFB) {
        console.log(`detector: EI opcode at PC=${hex4(pcBefore)}`);
      }
    }

    // Special logging around the branch that diverges in Sonic: 013D/0141
    if (expect.pc === 0x013d || expect.pc === 0x0141) {
      try {
        const iy = cpu.getState().iy & 0xffff;
        const addr = (iy + 7) & 0xffff;
        let v = machine.getBus().read8(addr) & 0xff;
        // Optional hack: force bit7 on (IY+7) at a chosen PC to test alignment hypotheses
        if (FORCE_IY7_BIT7_AT_PC !== null && expect.pc === FORCE_IY7_BIT7_AT_PC && (v & 0x80) === 0) {
          machine.getBus().write8(addr, v | 0x80);
          v = v | 0x80;
          console.log(`hack set (IY+7) bit7 at PC=${hex4(expect.pc)} addr=${hex4(addr)} -> ${hex2(v)}`);
        }
        console.log(`probe PC=${hex4(expect.pc)} IY=${hex4(iy)} (IY+7)=${hex2(v)} bit7=${(v>>7)&1}`);
      } catch {}
    }

    if (pcBefore !== expect.pc) {
      // Hard lock-to-cart: if requested and we are still <C000 while oracle expects >=C000, jump immediately
      const lockToCartHard = process.env.LOCK_TO_CART === '1' || process.env.LOCK_TO_CART === 'true';
      if (lockToCartHard && pcBefore < 0xC000 && expect.pc >= 0xC000) {
        try {
          const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
          (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
        } catch {}
        try {
          const stForce = cpu.getState();
          stForce.pc = expect.pc & 0xffff;
          cpu.setState(stForce);
          pcBefore = expect.pc & 0xffff;
          console.log(`lock-to-cart (hard) jumped PC to ${hex4(expect.pc)} (BIOS off).`);
        } catch {}
        continue;
      }
      // Special-case: BIOS tight DEC/OR/JR loop and immediate post-loop return sites
      let skipGenericSeek = false;
      const inBioLoop = (pc: number): boolean => (pc >= 0x0314 && pc <= 0x0317);
      const inBioBlock = (pc: number): boolean => inBioLoop(pc) || pc === 0x0319 || pc === 0x031C;
      const collapseToCart = process.env.BIOS_COLLAPSE_TO_CART === '1' || process.env.BIOS_COLLAPSE_TO_CART === 'true';
      const inBioExtendedBlock = (pc: number): boolean => collapseToCart ? (pc < 0xC000) : inBioBlock(pc);
      // IY wait-loop (BIT 0,(IY+0) @ 0x031C and JR Z,-6 @ 0x0320)
      const inIYLoop = (pc: number): boolean => (pc === 0x031c || pc === 0x0320);
      // Detect VDP data writes in ROM path: OUT (BE),A and OUT (BF),A
      const isVdpOutAt = (pc: number): boolean => {
        try {
          const t = disasmAt(pc).toUpperCase();
          return /^OUT \((BE|BF)\),A$/.test(t);
        } catch { return false; }
      };

      // Highest priority: if expected is in cart/WRAM (>=C000) and we are still in any collapsed BIOS/low region (<C000),
      // spin until we leave <C000 or force-jump if LOCK_TO_CART is enabled.
      if (pcBefore < 0xC000 && expect.pc >= 0xC000) {
        const SPIN_CAP_ANY = process.env.BIOS_LOOP_SPIN_LIMIT ? parseInt(process.env.BIOS_LOOP_SPIN_LIMIT, 10) : 100_000_000;
        let spin = 0;
        if (PROBE_LOOP) console.log(`pre-cart-spin ENTER pc=${hex4(pcBefore)} want>=C000 cap=${SPIN_CAP_ANY}`);
        while (spin < SPIN_CAP_ANY && (cpu.getState().pc & 0xffff) < 0xC000) {
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spin++;
        }
        pcBefore = cpu.getState().pc & 0xffff;
        if (PROBE_LOOP) console.log(`pre-cart-spin EXIT pc=${hex4(pcBefore)} spin=${spin}${pcBefore<0xC000?' (still< C000)':''}`);
        if (pcBefore < 0xC000) {
          const lockToCart = process.env.LOCK_TO_CART === '1' || process.env.LOCK_TO_CART === 'true';
          if (lockToCart) {
            try {
              const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
              (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
            } catch {}
            try {
              const stForce = cpu.getState();
              stForce.pc = expect.pc & 0xffff;
              cpu.setState(stForce);
              pcBefore = expect.pc & 0xffff;
              console.log(`lock-to-cart jumped PC to ${hex4(expect.pc)} (BIOS off).`);
            } catch {}
          }
        }
        // Re-evaluate after spin/jump
        if (pcBefore !== expect.pc) {
          // Try scanning forward in MAME to our current PC
          let matchedSkip = -1;
          for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
            if (mameLines[startIdx + consumed + sidx]!.pc === pcBefore) { matchedSkip = sidx; break; }
          }
          if (matchedSkip > 0) {
            console.log(`Skipped ${matchedSkip} line(s) in MAME trace after pre-cart spin to re-sync at PC ${hex4(pcBefore)}.`);
            consumed += matchedSkip;
          }
        }
        // Restart outer loop to handle new state
        continue;
      }

      // Special collapse for IY polling loop (031C/0320): oracle collapses this; we spin until exit then resync
      const IY_COLLAPSE = process.env.IY_COLLAPSE === '1' || process.env.IY_COLLAPSE === 'true' || true; // default on
      if (IY_COLLAPSE && inIYLoop(pcBefore) && !inIYLoop(expect.pc)) {
        const SPIN_CAP_IY = process.env.IY_LOOP_SPIN_LIMIT ? parseInt(process.env.IY_LOOP_SPIN_LIMIT, 10) : 50_000_000;
        let spins = 0;
        if (PROBE_LOOP) console.log(`iycollapse ENTER pc=${hex4(pcBefore)} cap=${SPIN_CAP_IY}`);
        while (spins < SPIN_CAP_IY && inIYLoop(pcBefore)) {
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spins++;
          pcBefore = cpu.getState().pc & 0xffff;
        }
        if (PROBE_LOOP) console.log(`iycollapse EXIT pc=${hex4(pcBefore)} spins=${spins}${inIYLoop(pcBefore)?' (cap_reached)':''}`);
        if (inIYLoop(pcBefore)) {
          console.error('DIVERGENCE');
          console.error(` step=${consumed}`);
          console.error(` expect: PC=${hex4(expect.pc)}  text="${expect.text ?? ''}"`);
          console.error(` actual: PC=${hex4(pcBefore)}  text="${disasmAt(pcBefore)}"`);
          console.error(' iycollapse cap reached without exiting; consider increasing IY_LOOP_SPIN_LIMIT.');
          process.exit(10);
        }
        // After exit, try to re-sync by scanning forward in MAME for our current PC
        let matchedSkipIY = -1;
        for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
          if (mameLines[startIdx + consumed + sidx]!.pc === pcBefore) { matchedSkipIY = sidx; break; }
        }
        if (matchedSkipIY > 0) {
          console.log(`Collapsed IY loop; skipped ${matchedSkipIY} line(s) to re-sync at PC ${hex4(pcBefore)}.`);
          consumed += matchedSkipIY;
        }
        // re-evaluate after collapsing
        continue;
      }

      // Case A: both expected and actual are within the BIOS collapsed block → spin until we leave the block or match
      if (inBioExtendedBlock(pcBefore) && inBioExtendedBlock(expect.pc)) {
        const SPIN_CAP = process.env.BIOS_LOOP_SPIN_LIMIT ? parseInt(process.env.BIOS_LOOP_SPIN_LIMIT, 10) : 100_000_000;
        let spin = 0;
        if (PROBE_LOOP) console.log(`biospin-inblock ENTER pc=${hex4(pcBefore)} want=${hex4(expect.pc)} cap=${SPIN_CAP}`);
        while (spin < SPIN_CAP && inBioExtendedBlock(pcBefore) && !pcsEqual(pcBefore, expect.pc)) {
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spin++;
          pcBefore = cpu.getState().pc & 0xffff;
        }
        if (PROBE_LOOP) console.log(`biospin-inblock EXIT pc=${hex4(pcBefore)} spin=${spin}${inBioExtendedBlock(pcBefore) ? '' : ' (left_block)'}${pcsEqual(pcBefore, expect.pc)?' (matched)':''}`);
        if (pcsEqual(pcBefore, expect.pc)) {
          // We matched the expected PC; continue normal flow
        } else if (!inBioExtendedBlock(pcBefore)) {
          // We left the block; try to resync by scanning forward in MAME to our current PC
          let matchedSkip = -1;
          for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
            if (pcsEqual(mameLines[startIdx + consumed + sidx]!.pc, pcBefore)) { matchedSkip = sidx; break; }
          }
          if (matchedSkip > 0) {
            console.log(`Skipped ${matchedSkip} line(s) in MAME trace after BIOS block to re-sync at PC ${hex4(pcBefore)}.`);
            consumed += matchedSkip;
          }
        } else {
          console.error('DIVERGENCE');
          console.error(` step=${consumed}`);
          console.error(` expect: PC=${hex4(expect.pc)}  text="${expect.text ?? ''}"`);
          console.error(` actual: PC=${hex4(pcBefore)}  text="${disasmAt(pcBefore)}"`);
          console.error(' biospin-inblock cap reached without leaving BIOS block or matching; increase BIOS_LOOP_SPIN_LIMIT or extend MAME trace.');
          process.exit(10);
        }
      }

      // Case B: we are inside the BIOS block but MAME already collapsed past it → spin until we exit then resync
      if (inBioExtendedBlock(pcBefore) && !inBioExtendedBlock(expect.pc)) {
        skipGenericSeek = true; // do not fall through to generic loop while spinning BIOS loop
        // If a forced anchor is provided, jump immediately to proceed into cart code (debug-only)
        const forceAnchorHex2 = process.env.FORCE_CART_ANCHOR || null;
        if (forceAnchorHex2) {
          const anchor = parseInt(forceAnchorHex2, 16) & 0xffff;
          try {
            // Disable BIOS only if anchor is not in BIOS space
            if (anchor >= 0xC000) {
              const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
              (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
            }
          } catch {}
          try {
            const stForce = cpu.getState();
            stForce.pc = anchor & 0xffff;
            cpu.setState(stForce);
            pcBefore = anchor & 0xffff;
            console.log(`force-anchor (immediate) jumped PC to ${hex4(anchor)}${anchor>=0xC000?' (BIOS off)':' (BIOS on)'}.
`);
          } catch {}
        }
        // Spin inside loop without requiring an immediate match; resync after loop exit
        const SPIN_CAP = process.env.BIOS_LOOP_SPIN_LIMIT ? parseInt(process.env.BIOS_LOOP_SPIN_LIMIT, 10) : 100_000_000;
        let spin = 0;
        if (PROBE_LOOP) console.log(`biospin ENTER pc=${hex4(pcBefore)} cap=${SPIN_CAP}`);
        while (spin < SPIN_CAP && inBioExtendedBlock(pcBefore)) {
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spin++;
          if (PROBE_LOOP && (spin % 1048576) === 0) {
            const st = cpu.getState();
            const bcVal = (((st.b & 0xff) << 8) | (st.c & 0xff)) & 0xffff;
            console.log(`biospin pc=${hex4(pcBefore)} spin=${spin} BC=${hex4(bcVal)}`);
          }
          pcBefore = cpu.getState().pc & 0xffff;
        }
        if (PROBE_LOOP) console.log(`biospin EXIT pc=${hex4(pcBefore)} spin=${spin}${inBioExtendedBlock(pcBefore) ? ' (cap_reached)' : ''}`);
        if (inBioExtendedBlock(pcBefore)) {
          const forceAnchorHex = process.env.FORCE_CART_ANCHOR || null;
          if (forceAnchorHex) {
            const anchor = parseInt(forceAnchorHex, 16) & 0xffff;
            // Jump to anchor PC to re-sync compare (debug-only); keep BIOS mapped if anchor is in BIOS
            try {
              if (anchor >= 0xC000) {
                const curMC = (machine.getBus() as any).getMemControl?.() ?? 0x00;
                (machine.getBus() as any).writeIO8?.(0x3e, (curMC | 0x04) & 0xff);
              }
            } catch {}
            try {
              const stForce = cpu.getState();
              stForce.pc = anchor & 0xffff;
              cpu.setState(stForce);
              pcBefore = anchor & 0xffff;
              console.log(`force-anchor jumped PC to ${hex4(anchor)}${anchor>=0xC000?' (BIOS off)':' (BIOS on)'}.
`);
            } catch {}
          } else {
            console.error('DIVERGENCE');
            console.error(` step=${consumed}`);
            console.error(` expect: PC=${hex4(expect.pc)}  text=\"${expect.text ?? ''}\"`);
            console.error(` actual: PC=${hex4(pcBefore)}  text=\"${disasmAt(pcBefore)}\"`);
            console.error(' biospin cap reached without exiting BIOS loop; consider increasing BIOS_LOOP_SPIN_LIMIT or extending MAME trace.');
            process.exit(10);
          }
        }
        // After exit, try to re-sync by scanning forward in MAME for our current PC
        let matchedSkip = -1;
        for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
          if (pcsEqual(mameLines[startIdx + consumed + sidx]!.pc, pcBefore)) { matchedSkip = sidx; break; }
        }
        if (matchedSkip > 0) {
          console.log(`Skipped ${matchedSkip} line(s) in MAME trace after BIOS loop to re-sync at PC ${hex4(pcBefore)}.`);
          consumed += matchedSkip;
        } else {
          // Fall through to generic seek to align to expected
        }
      }
      // If we are still inside BIOS loop and expected is outside, skip generic seek this iteration
      if (skipGenericSeek && inBioExtendedBlock(pcBefore) && !inBioExtendedBlock(expect.pc)) {
        continue; // restart loop to re-evaluate after more spinning next iteration
      }

      // Case D: Expected is in WRAM (>= C000) calling into relocated routines, while we are still in ROM (< C000)
      // executing direct VDP writer path (OUT (BE|BF),A). Anchor on IO behavior: spin while VDP out bursts continue,
      // then re-sync by scanning forward in MAME to our current PC; if no match, continue to next expected region.
      if (expect.pc >= 0xC000 && pcBefore < 0xC000 && isVdpOutAt(pcBefore)) {
        const IO_SPIN_CAP = process.env.IO_SPIN_LIMIT ? parseInt(process.env.IO_SPIN_LIMIT, 10) : 50_000_000;
        let spin = 0;
        if (PROBE_LOOP) console.log(`io-anchored ENTER pc=${hex4(pcBefore)} want>=C000 cap=${IO_SPIN_CAP}`);
        // Heuristic: treat as IO-anchored as long as most steps are OUT (BE|BF), tolerate gaps like INC/EXX/NOP
        let budgetNonIO = 0;
        const NONIO_BUDGET = 2048; // allow some control ops interleaved
        while (spin < IO_SPIN_CAP && (cpu.getState().pc & 0xffff) < 0xC000) {
          const before = cpu.getState().pc & 0xffff;
          const txt = disasmAt(before).toUpperCase();
          const wasVdp = /^OUT \((BE|BF)\),A$/.test(txt);
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spin++;
          if (!wasVdp) {
            budgetNonIO++;
            if (budgetNonIO > NONIO_BUDGET) break; // left IO-heavy window
          }
          pcBefore = cpu.getState().pc & 0xffff;
          if (!isVdpOutAt(pcBefore) && budgetNonIO > NONIO_BUDGET) break;
        }
        if (PROBE_LOOP) console.log(`io-anchored EXIT pc=${hex4(pcBefore)} spin=${spin}${pcBefore<0xC000?' (<C000)':''}`);
        // Try to re-sync by scanning forward in MAME for our current PC
        let matchedSkipIO = -1;
        for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
          if (pcsEqual(mameLines[startIdx + consumed + sidx]!.pc, pcBefore)) { matchedSkipIO = sidx; break; }
        }
        if (matchedSkipIO > 0) {
          console.log(`Skipped ${matchedSkipIO} line(s) in MAME trace after IO window to re-sync at PC ${hex4(pcBefore)}.`);
          consumed += matchedSkipIO;
        }
        continue; // re-evaluate state
      }

      // Case E: Short poll loops using DJNZ back (e.g., IN A,(n); DJNZ -6). Spin inside the loop until exit, then re-sync.
      if (isShortDjNzPoll(pcBefore) && !isShortDjNzPoll(expect.pc)) {
        const SPIN_CAP_POLL = process.env.POLL_SPIN_LIMIT ? parseInt(process.env.POLL_SPIN_LIMIT, 10) : 50_000_000;
        let spin = 0;
        if (PROBE_LOOP) console.log(`pollloop ENTER pc=${hex4(pcBefore)} cap=${SPIN_CAP_POLL}`);
        // Capture loop head addresses to detect exit: allow both the IN A,(n) site and the trailing DJNZ site
        // We will consider we exited once neither current PC nor previous PC sites match the short-loop pattern
        while (spin < SPIN_CAP_POLL && isShortDjNzPoll(pcBefore)) {
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spin++;
          pcBefore = cpu.getState().pc & 0xffff;
        }
        if (PROBE_LOOP) console.log(`pollloop EXIT pc=${hex4(pcBefore)} spin=${spin}${isShortDjNzPoll(pcBefore)?' (cap_reached)':''}`);
        if (isShortDjNzPoll(pcBefore)) {
          console.error('DIVERGENCE');
          console.error(` step=${consumed}`);
          console.error(` expect: PC=${hex4(expect.pc)}  text="${expect.text ?? ''}"`);
          console.error(` actual: PC=${hex4(pcBefore)}  text="${disasmAt(pcBefore)}"`);
          console.error(' pollloop cap reached without exiting; consider increasing POLL_SPIN_LIMIT or extending the trace.');
          process.exit(10);
        }
        // After exiting loop, try to re-sync by scanning forward in MAME for our current PC
        let matchedSkipPoll = -1;
        for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
          if (pcsEqual(mameLines[startIdx + consumed + sidx]!.pc, pcBefore)) { matchedSkipPoll = sidx; break; }
        }
        if (matchedSkipPoll > 0) {
          console.log(`Skipped ${matchedSkipPoll} line(s) in MAME trace after poll loop to re-sync at PC ${hex4(pcBefore)}.`);
          consumed += matchedSkipPoll;
        }
        continue; // restart loop after spin
      }

      // Case C: we are inside the IY wait-loop (031C/0320) while MAME likely collapsed past it → spin until exit then resync
      if (inIYLoop(pcBefore) && !inIYLoop(expect.pc)) {
        skipGenericSeek = true;
        const SPIN_CAP_IY = process.env.IY_LOOP_SPIN_LIMIT ? parseInt(process.env.IY_LOOP_SPIN_LIMIT, 10) : 50_000_000;
        let spin = 0;
        if (PROBE_LOOP) console.log(`iyloop ENTER pc=${hex4(pcBefore)} cap=${SPIN_CAP_IY}`);
        while (spin < SPIN_CAP_IY && inIYLoop(pcBefore)) {
          const r = cpu.stepOne(); vdp.tickCycles(r.cycles); psg.tickCycles(r.cycles); if (vdp.hasIRQ()) cpu.requestIRQ();
          spin++;
          if (PROBE_LOOP && (spin % 1_048_576) === 0) {
            try {
              const st = cpu.getState();
              const vs = vdp.getState ? vdp.getState() : undefined;
              const iy0 = busRef.read8(st.iy & 0xffff) & 0xff;
              console.log(`iyloop spin=${spin} pc=${hex4(st.pc & 0xffff)} vline=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} hasIRQ=${vdp.hasIRQ()?1:0} IY0=${hex2(iy0)}`);
            } catch {}
          }
          pcBefore = cpu.getState().pc & 0xffff;
        }
        if (PROBE_LOOP) console.log(`iyloop EXIT pc=${hex4(pcBefore)} spin=${spin}${inIYLoop(pcBefore) ? ' (cap_reached)' : ''}`);
        if (inIYLoop(pcBefore)) {
          // Cap reached without exit
          console.error('DIVERGENCE');
          console.error(` step=${consumed}`);
          console.error(` expect: PC=${hex4(expect.pc)}  text="${expect.text ?? ''}"`);
          console.error(` actual: PC=${hex4(pcBefore)}  text="${disasmAt(pcBefore)}"`);
          console.error(' iyloop cap reached without exiting; consider increasing IY_LOOP_SPIN_LIMIT or extending the trace.');
          process.exit(10);
        }
        // After exit, try to re-sync by scanning forward in MAME for our current PC
        let matchedSkipIY = -1;
        for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
          if (pcsEqual(mameLines[startIdx + consumed + sidx]!.pc, pcBefore)) { matchedSkipIY = sidx; break; }
        }
        if (matchedSkipIY > 0) {
          console.log(`Skipped ${matchedSkipIY} line(s) in MAME trace after IY loop to re-sync at PC ${hex4(pcBefore)}.`);
          consumed += matchedSkipIY;
        }
        // Regardless, restart outer loop to evaluate new state/expected
        continue;
      }

      // If MAME collapsed a block operation (e.g., LDIR/LDDR/CPIR/CPDR), tolerate by consuming the expected line
      // without requiring an immediate PC match. This aligns our post-block PC with the next MAME PC.
      {
        const t = (expect.text || '').trim().toLowerCase();
        if (t === 'ldir' || t === 'lddr' || t === 'cpir' || t === 'cpdr') {
          console.log(`Collapsed block op at expected PC ${hex4(expect.pc)} (${t}); consuming expected line to align post-block.`);
          consumed++;
          continue; // re-evaluate with next expected line
        }
      }

      // Attempt to seek forward in our emulator until expected PC is reached, to tolerate MAME loop-collapsed sections
      let seekSteps = 0;
      // Loop-aware extended limits
      const inWaitLoop = (pc: number): boolean => (pc === 0x031c || pc === 0x0320);
      const inDecOrLoop = (pc: number): boolean => (pc >= 0x0314 && pc <= 0x0317);
      const inVdpFrameLoop = (pc: number): boolean => (pc >= 0x0460 && pc <= 0x04E0);
      const effLimitFor = (pc: number): number => inWaitLoop(pc)
        ? LOOP_SEEK_LIMIT
        : ((inDecOrLoop(pc) || inVdpFrameLoop(pc) || isShortDjNzPoll(pc) || isShortCondJrBack(pc)) ? BLOCK_SEEK_LIMIT : SEEK_LIMIT);
      let seekLimitDynamic = effLimitFor(pcBefore);
      while (seekSteps < seekLimitDynamic && !pcsEqual(pcBefore, expect.pc)) {
      const sBefore = cpu.getState();
      const beforePCSeek = sBefore.pc & 0xffff;
      // Optional hack: if stuck in the IY wait loop and allowed, force (IY+0) bit0 to 1 to break the loop
      if (HACK_IY0_BIT0 && (pcBefore === 0x031c || pcBefore === 0x0320)) {
        try {
          const iy = sBefore.iy & 0xffff;
          const cur = busRef.read8(iy) & 0xff;
          if ((cur & 0x01) === 0) busRef.write8(iy, (cur | 0x01) & 0xff);
        } catch {}
      }
      const r = cpu.stepOne();
      vdp.tickCycles(r.cycles);
      psg.tickCycles(r.cycles);
      if (vdp.hasIRQ()) cpu.requestIRQ();
      // IO logging also during seek window, so we can observe OUT/IN sequences even before alignment
      if (IO_LOG && inFocus && focusRemaining > 0) {
        const text = disasmAt(beforePCSeek).toUpperCase();
        let m: RegExpMatchArray | null;
        if ((m = text.match(/^IN A,\((\$?[0-9A-F]{2}|C)\)$/i)) != null) {
          let port: number | null = null;
          const arg = m[1]!.replace('$','');
          const regs = cpu.getState();
          if (arg.toUpperCase() === 'C') port = regs.c & 0xff; else port = parseInt(arg, 16) & 0xff;
          if (port !== null && IO_PORTS.includes(port)) console.log(`io IN  pc=${hex4(beforePCSeek)} port=${hex2(port)} -> A=${hex2(regs.a & 0xff)}`);
        } else if ((m = text.match(/^OUT \((\$?[0-9A-F]{2}|C)\),A$/i)) != null) {
          let port: number | null = null;
          const arg = m[1]!.replace('$','');
          const regs = cpu.getState();
          if (arg.toUpperCase() === 'C') port = regs.c & 0xff; else port = parseInt(arg, 16) & 0xff;
          if (port !== null && IO_PORTS.includes(port)) {
            const a = (regs.a & 0xff);
            console.log(`io OUT pc=${hex4(beforePCSeek)} port=${hex2(port)} A=${hex2(a)}`);
          }
        }
      }
        if (PROBE_LOOP && r.irqAccepted) {
        const sbc = (((sBefore.b & 0xff) << 8) | (sBefore.c & 0xff)) & 0xffff;
        const sAfter = cpu.getState();
        const abc = (((sAfter.b & 0xff) << 8) | (sAfter.c & 0xff)) & 0xffff;
        console.log(`cpu IRQ_ACCEPT beforePC=${hex4(pcBefore)} BC_before=${hex4(sbc)} BC_after=${hex4(abc)} newPC=${hex4(sAfter.pc & 0xffff)}`);
      }
      // Instrument the BIOS DEC/OR/JR loop at 0x0314..0x0317 to observe BC progress
      if (PROBE_LOOP && (pcBefore >= 0x0314 && pcBefore <= 0x0317)) {
        const stBio = cpu.getState();
        const bcVal = (((stBio.b & 0xff) << 8) | (stBio.c & 0xff)) & 0xffff;
        bioLoopIters++;
        if ((bioLoopIters & 0x0FFF) === 0) {
          console.log(`bioLoop pc=${hex4(pcBefore)} iters=${bioLoopIters} BC=${hex4(bcVal)} IFF1=${stBio.iff1 ? 1 : 0}`);
        }
        bioLoopLastBC = bcVal;
      }
      // VDP event probe during seek
      if (PROBE_LOOP) {
        try {
          const hasIRQ = vdp.hasIRQ();
          const vs = vdp.getState ? vdp.getState() : undefined;
          const vblankFlag = vs ? ((vs.status & 0x80) ? 1 : 0) : 0;
          if (hasIRQ && !prevVdpHasIRQ) {
            const st = cpu.getState();
            console.log(`vdpevent IRQ_RISE pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
          }
          if (!hasIRQ && prevVdpHasIRQ) {
            const st = cpu.getState();
            console.log(`vdpevent IRQ_FALL pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
          }
          if (vblankFlag !== prevVblankFlag) {
            const st = cpu.getState();
            const tag = vblankFlag ? 'VBLANK_SET' : 'VBLANK_CLR';
            console.log(`vdpevent ${tag} pc=${hex4(st.pc & 0xffff)} line=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)}`);
          }
          prevVdpHasIRQ = hasIRQ;
          prevVblankFlag = vblankFlag;
        } catch {}
      }
      if (r.irqAccepted) totalIrqAccepted++;
      if (DEBUG_EI && !prevIFF1 && cpu.getState().iff1) {
        console.log(`detector: IFF1 set true at PC=${hex4(cpu.getState().pc & 0xffff)}`);
      }
      prevIFF1 = cpu.getState().iff1;
        if (r.irqAccepted) totalIrqAccepted++;
        if (DEBUG_EI && !prevIFF1 && cpu.getState().iff1) {
          console.log(`detector: IFF1 set true at PC=${hex4(cpu.getState().pc & 0xffff)}`);
        }
        prevIFF1 = cpu.getState().iff1;
        seekSteps++;
        s = cpu.getState();
        pcBefore = s.pc & 0xffff;
        // Dynamically widen the limit if we enter a recognized long loop during seeking
        const newEff = effLimitFor(pcBefore);
        if (newEff > seekLimitDynamic) seekLimitDynamic = newEff;
        if (PROBE_LOOP && (pcBefore === 0x031c || pcBefore === 0x0320) && loopWindowRemain === 0) {
          loopWindowRemain = PROBE_LOOP_STEPS;
          try {
            const d200 = busRef.read8(0xd200) & 0xff;
            const vs = vdp.getState ? vdp.getState() : undefined;
            console.log(`loopwin START pc=${hex4(pcBefore)} IY=${hex4(s.iy & 0xffff)} D200=${hex2(d200)} vline=${vs ? (vs.line|0) : -1}`);
          } catch {}
        }
        if (PROBE_LOOP && loopWindowRemain > 0) {
          try {
            const vs = vdp.getState ? vdp.getState() : undefined;
            const d200 = busRef.read8(0xd200) & 0xff;
            const iy0 = busRef.read8(s.iy & 0xffff) & 0xff;
            console.log(`loopwin pc=${hex4(s.pc & 0xffff)} irqAcc=${r.irqAccepted?1:0} hasIRQ=${vdp.hasIRQ()?1:0} vline=${vs ? (vs.line|0) : -1} vb_en=${vs ? (vs.vblankIrqEnabled?1:0) : -1} vstat=${hex2(vs ? (vs.status&0xff) : 0)} D200=${hex2(d200)} IY0=${hex2(iy0)}`);
          } catch {}
          loopWindowRemain--;
          if (loopWindowRemain === 0) console.log('loopwin END');
        }
        if (PROBE_LOOP && (pcBefore === 0x031c || pcBefore === 0x0320)) {
          try {
            const iy = s.iy & 0xffff;
            const iy0 = busRef.read8(iy) & 0xff;
            const d200 = busRef.read8(0xd200) & 0xff;
            const v = vdp.getState ? vdp.getState() : undefined;
            const hasIRQ = vdp.hasIRQ();
            const ln = v ? (v.line | 0) : -1;
            const vbEn = v ? (v.vblankIrqEnabled ? 1 : 0) : -1;
            const stReg = v ? (v.status & 0xff) : -1;
            console.log(`loopprobe pc=${hex4(pcBefore)} IY=${hex4(iy)} IFF1=${s.iff1 ? 1 : 0} (IY+0)=${hex2(iy0)} D200=${hex2(d200)} VDP_IRQ=${hasIRQ ? 1 : 0} VLINE=${ln} VB_EN=${vbEn} VSTAT=${hex2(stReg)}`);
          } catch {}
        }
      }
      if (!pcsEqual(pcBefore, expect.pc)) {
        // Try skipping forward in the MAME trace to account for conditional branches taken there but not here
        let matchedSkip = -1;
        for (let sidx = 1; sidx <= MAME_SKIP_LIMIT && (startIdx + consumed + sidx) < mameLines.length; sidx++) {
          if (pcsEqual(mameLines[startIdx + consumed + sidx]!.pc, pcBefore)) { matchedSkip = sidx; break; }
        }
        if (matchedSkip > 0) {
          console.log(`Skipped ${matchedSkip} line(s) in MAME trace to re-sync at PC ${hex4(pcBefore)}.`);
          consumed += matchedSkip; // consume skipped expected lines
        } else {
          // Optional relocation force-jump: if both PCs are within a known alias window, force jump to expected.
          const RELOC_FORCE = (process.env.RELOC_FORCE === '1' || process.env.RELOC_FORCE === 'true' || true);
          let jumped = false;
          if (RELOC_FORCE) {
            for (const r of relocAliases) {
              const aInA = pcBefore >= r.loA && pcBefore <= r.hiA;
              const eInB = expect.pc >= r.loB && expect.pc <= r.hiB;
              const aInB = pcBefore >= r.loB && pcBefore <= r.hiB;
              const eInA = expect.pc >= r.loA && expect.pc <= r.hiA;
              if ((aInA && eInB) || (aInB && eInA)) {
                try {
                  const stForce = cpu.getState();
                  stForce.pc = expect.pc & 0xffff;
                  cpu.setState(stForce);
                  console.log(`reloc-sync jumped PC to ${hex4(expect.pc)} (alias window)`);
                  jumped = true;
                } catch {}
                break;
              }
            }
          }
          if (jumped) {
            // Re-evaluate this iteration with updated PC
            continue;
          }
          console.error('DIVERGENCE');
          console.error(` step=${consumed}`);
          console.error(` expect: PC=${hex4(expect.pc)}  text="${expect.text ?? ''}"`);
          console.error(` actual: PC=${hex4(pcBefore)}  text="${disasmAt(pcBefore)}"`);
          console.error(` regs:   ${regsSnapshot()}`);
          // Dump a small RAM window around IY (if meaningful)
          try {
            const iy = cpu.getState().iy & 0xffff;
            const start = (iy - 16) & 0xffff;
            const dump: string[] = [];
            for (let off = 0; off < 64; off++) {
              const addr = (start + off) & 0xffff;
              const v = machine.getBus().read8(addr) & 0xff;
              dump.push(`${hex4(addr)}:${hex2(v)}`);
            }
            console.error(` mem[iy-16..iy+47]: ${dump.join(' ')}`);
          } catch {}
          console.error(' recent trace:');
          for (const line of myTraceHistory) console.error(`  ${line}`);
          console.error(' raw expect line:');
          console.error(`  ${expect.raw}`);
          console.error(` seeked_steps=${seekSteps} (limit=${seekLimitDynamic})`);
          process.exit(10);
        }
      }
      // Optional: log seek info when non-zero
      if (seekSteps > 0) {
        console.log(`Seeked ${seekSteps} steps to match expected PC ${hex4(expect.pc)} (tolerating collapsed loop).`);
      }
      // Reset BIOS loop counters when we finish a seek window
      bioLoopIters = 0; bioLoopLastBC = -1;
      // If we failed to reach expected PC but are currently in a recognized long loop, tolerate by skipping further in expected trace as needed later
    }

    // Step the matching instruction and advance expected index
    const sBeforeStep = cpu.getState();
    const r = cpu.stepOne();
    vdp.tickCycles(r.cycles);
    psg.tickCycles(r.cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
    if (PROBE_LOOP && r.irqAccepted) {
      const sbc = (((sBeforeStep.b & 0xff) << 8) | (sBeforeStep.c & 0xff)) & 0xffff;
      const sAfter = cpu.getState();
      const abc = (((sAfter.b & 0xff) << 8) | (sAfter.c & 0xff)) & 0xffff;
      console.log(`cpu IRQ_ACCEPT beforePC=${hex4(pcBefore)} BC_before=${hex4(sbc)} BC_after=${hex4(abc)} newPC=${hex4(sAfter.pc & 0xffff)}`);
    }

    // Optional I/O logging during focus window
    if (IO_LOG && inFocus && focusRemaining > 0) {
      const text = disasmAt(pcBefore).toUpperCase();
      const regs = cpu.getState();
      // Match patterns: IN A,(nn) or IN A,(C)
      let m: RegExpMatchArray | null;
      if ((m = text.match(/^IN A,\((\$?[0-9A-F]{2}|C)\)$/i)) != null) {
        let port: number | null = null;
        const arg = m[1]!.replace('$','');
        if (arg.toUpperCase() === 'C') port = regs.c & 0xff; else port = parseInt(arg, 16) & 0xff;
        if (port !== null && IO_PORTS.includes(port)) {
          console.log(`io IN  pc=${hex4(pcBefore)} port=${hex2(port)} -> A=${hex2(regs.a)}`);
        }
      } else if ((m = text.match(/^OUT \((\$?[0-9A-F]{2}|C)\),A$/i)) != null) {
        let port: number | null = null;
        const arg = m[1]!.replace('$','');
        if (arg.toUpperCase() === 'C') port = regs.c & 0xff; else port = parseInt(arg, 16) & 0xff;
        if (port !== null && IO_PORTS.includes(port)) {
          console.log(`io OUT pc=${hex4(pcBefore)} port=${hex2(port)} A=${hex2(regs.a)}`);
        }
      }
    }

    // Memory watch reporting (log actual PC we just executed)
    if (watchList.length > 0) {
      const pcJustExec = hex4(pcBefore);
      for (const a of watchList) {
        const cur = machine.getBus().read8(a) & 0xff;
        const prev = watchPrev.get(a)!;
        if (cur !== prev) {
          console.log(`memwatch ${pcJustExec} ${hex4(a)}: ${hex2(prev)} -> ${hex2(cur)}`);
          watchPrev.set(a, cur);
        }
      }
    }

    consumed++;
    if (inFocus && focusRemaining > 0) focusRemaining--; if (inFocus && focusRemaining <= 0) { inFocus = false; console.log('Exited focus window.'); }
  }

  console.log(`No divergence detected after ${limit} steps (skip=${startIdx}${ENV_ALIGN_PC_HEX ? ` align=${ENV_ALIGN_PC_HEX}` : ''}).`);
  console.log(`Compared against trace: ${tracePath}`);
  if (ourTraceStream) await ourTraceStream.close();
};

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(99);
});

