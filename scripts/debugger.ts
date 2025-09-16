#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createZ80 } from '../src/cpu/z80/z80.js';
import { SmsBus, type Cartridge, type IBus } from '../src/bus/bus.js';
import { createVDP } from '../src/vdp/vdp.js';
import { createPSG } from '../src/psg/sn76489.js';
import { disassembleOne } from '../src/cpu/z80/disasm.js';
import { initializeSMS, enableSMSInterrupts } from '../src/machine/sms_init.js';

// A simple, non-interactive debugger CLI you can drive with subcommands.
// Example:
//   node dist/scripts/debugger.js rom ./sonic.sms setio 0x7e 0xfe vblankirq on run 100 regs disasm pc 10
// Commands:
//   rom <path>
//   run <steps>
//   cont <maxSteps?>          (run until breakpoint or limit)
//   untilirq <maxSteps?>      (run until an IRQ/NMI is accepted or limit)
//   regs
//   mem <addr> <len>
//   disasm <addr|pc> <count>
//   setio <port> <value>      (force read value for a port)
//   pad <0xdc|0xdd> <value>   (override controller port value, active-low)
//   breakpc <addr>
//   breakio <port>
//   breakstatus               (break when VDP status port 0xBF is read)
//   breakei                   (break when EI executes)
//   vblankirq <on|off>        (enable VBlank IRQ in VDP reg1 bit5)
//   forceei                   (force IFF1/IFF2 enabled on CPU)
//   forceirq                  (assert IRQ request line once)
//   breakop <byte>            (break when next opcode equals this byte)
//   breakout <port>           (break on OUT (n),A to this immediate port)
//   findop <byte> <limit?>    (scan current memory map for opcode byte)
//   setpc <addr>              (set PC to address)
//   breakvblank              (break when VDP.hasIRQ() becomes true)
//   vdp                      (print VDP register/state snapshot)
//   vram <addr> <len>        (dump VDP VRAM bytes starting at addr)
//   vramcur <back> <len>     (dump VRAM around current VDP address; start at curAddr-back)
//   breakvdpdata <streak>    (break when there are this many consecutive writes to 0xBE)
//   breakvdpdatacount <n>    (break when total writes to 0xBE since set reach n)
//   breakdisplay             (break when VDP displayEnabled becomes true)
//   breakvdpreg <r> <m> <v>  (break on VDP reg write when (data&m)==(v&m))
//   breakr1disp              (break when VDP R1 display enable bit6 is set)
//   breakcramw               (break on first CRAM write)
//   breakioread <mask> <value>      (break when any IO read returns value matching mask)
//   breakioreadp <port> <mask> <value> (break when IO read on port matches)
//   iostats                  (print IO read counts by port)
//   clearstats               (clear IO read counters)
//   render                   (render name table as 32x28 tile indices)
//   renderocc                (render occupancy: whether tile index has any nonzero pattern bytes)
//   satdump <count?>         (dump first <count> sprite entries from SAT; default 16)
//   clearbreaks              (disable all break conditions)
//   help
//   cram                     (dump 32-byte SMS CRAM)

const toNum = (s: string): number => {
  const t = s.trim().toLowerCase();
  if (t.startsWith('0x')) return parseInt(t, 16) >>> 0;
  return parseInt(t, 10) >>> 0;
};

const hex = (n: number, w = 2): string => n.toString(16).toUpperCase().padStart(w, '0');

const main = (): void => {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help') {
    console.log('Usage: node dist/scripts/debugger.js rom <path> [commands...]');
    process.exit(0);
  }

  let romPath: string | null = null;
  const cmds: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i++]!;
    if (tok === 'rom' && i < argv.length) {
      romPath = argv[i++]!;
    } else {
      cmds.push(tok);
    }
  }

  if (!romPath) {
    console.error('Missing rom <path>.');
    process.exit(1);
  }

  const buf = readFileSync(romPath);
  const rom = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const cart: Cartridge = { rom };
  console.log(`Loaded ROM: ${basename(romPath)} (${rom.length} bytes)`);

  const vdp = createVDP();
  const psg = createPSG();
  const bus = new SmsBus(cart, vdp, psg);

  // IO read overrides
  const ioOverrides = new Map<number, number>();
  // Controller pad overrides (active-low), default none
  const padOverrides = new Map<number, number>(); // keys 0xdc and/or 0xdd
  // Breakpoints
  const breakPc = new Set<number>();
  const breakIo = new Set<number>();

  let lastIOPort: number | null = null;
  let lastIOIsWrite = false;
  let brokeOn: string | null = null;
  let breakOnEI = false;
  let breakStatusRead = false;
  const breakOps = new Set<number>();
  let breakVBlank = false;
  let breakDisplayOn = false;
  const breakOutPorts = new Set<number>();
  let breakVdpDataStreakTarget = 0;
  let vdpDataStreak = 0;
  let breakVdpDataTotalTarget = 0;
  let vdpDataTotal = 0;
  // IO read trace for a specific port
  let traceReadPort: number | null = null;
  let traceReadRemain = 0;
  const traceReadLog: string[] = [];
  // VDP control write latch tracking for breakvdpreg
  let vdpCtrlLatch: number | null = null;
  type VdpRegBreak = { reg: number; mask: number; value: number };
  const vdpRegBreaks: VdpRegBreak[] = [];
  let breakOnCramWrite = false;
  // IO read break and stats
  let breakIOReadMask: number | null = null;
  let breakIOReadValue: number = 0;
  let breakIOReadPortMask: number | null = null;
  let breakIOReadPortValue: number = 0;
  const ioReadCounts: number[] = Array.from({ length: 256 }, () => 0);
  const ioWriteCounts: number[] = Array.from({ length: 256 }, () => 0);
  // VDP control/data ring buffer log
  const vdpLogSize = 4096;
  const vdpLog: (string | undefined)[] = new Array(vdpLogSize);
  let vdpLogNext = 0;
  let vdpLogCount = 0;
  let vdpLogData = false; // off by default; avoids flooding log with DATA entries
  const vdpLogPush = (msg: string): void => {
    vdpLog[vdpLogNext] = msg;
    vdpLogNext = (vdpLogNext + 1) % vdpLogSize;
    if (vdpLogCount < vdpLogSize) vdpLogCount++;
  };
  // PC sampling for hotspots
  let pcSampleInterval = 0; // 0 = off; otherwise sample every N steps
  let pcSampleCounter = 0;
  const pcCounts = new Map<number, number>();
  const bumpPcCount = (pc: number): void => {
    const cur = pcCounts.get(pc) || 0;
    pcCounts.set(pc, cur + 1);
  };
  // PC watch: log hits to specific PCs without breaking
  const pcWatchSet = new Set<number>();
  const pcWatchLog: string[] = [];
  // PC path capture: record consecutive PCs for N steps without breaking
  let pcPathRemain = 0;
  const pcPathLog: number[] = [];
  // Global step counter
  let stepCounter = 0;

  let traceIOAllRemain = 0;
  let traceIOAllSkip: number | null = null;
  // Memory write breakpoints
  const breakMemWrite = new Set<number>();
  const breakMemWriteRanges: { start: number; end: number }[] = [];
  const breakMemWriteVals: { addr: number; mask: number; value: number }[] = [];
  const busProxy: IBus = {
    read8: (addr: number): number => bus.read8(addr),
    write8: (addr: number, val: number): void => {
      const a = addr & 0xffff;
      if (breakMemWrite.has(a)) {
        brokeOn = `mem-write ${hex(a, 4)}=${hex(val)}`;
      } else {
        for (const br of breakMemWriteVals) {
          if (a === br.addr && (val & br.mask) >>> 0 === (br.value & br.mask) >>> 0) {
            brokeOn = `mem-write-val ${hex(a, 4)}=${hex(val)} mask=${hex(br.mask)} want=${hex(br.value)}`;
            break;
          }
        }
        if (!brokeOn) {
          for (const r of breakMemWriteRanges) {
            if (a >= r.start && a <= r.end) {
              brokeOn = `mem-write-range ${hex(a, 4)}=${hex(val)} in ${hex(r.start, 4)}..${hex(r.end, 4)}`;
              break;
            }
          }
        }
      }
      bus.write8(a, val);
    },
    readIO8: (port: number): number => {
      const p = port & 0xff;
      lastIOPort = p;
      lastIOIsWrite = false;
      if (breakIo.has(p)) brokeOn = `io-read ${p.toString(16)}`;
      if (breakStatusRead && p === 0xbf) brokeOn = 'status-read';
      let ret: number;
      if (ioOverrides.has(p)) ret = ioOverrides.get(p)! & 0xff;
      else if ((p === 0xdc || p === 0xdd) && padOverrides.has(p)) ret = padOverrides.get(p)! & 0xff;
      else ret = bus.readIO8(p);
      ioReadCounts[p] = ((ioReadCounts[p] ?? 0) + 1) >>> 0;
      const gs = (vdp as any).getState?.();
      const hc = gs ? (gs.lastHcRaw ?? 0) : 0;
      const ln = gs ? (gs.line ?? 0) : 0;
      if (traceReadPort !== null && p === (traceReadPort & 0xff) && traceReadRemain > 0) {
        traceReadLog.push(`pc=${hex(lastPc, 4)} port=${hex(p)} val=${hex(ret)} line=${ln} hc=${hex(hc)}`);
        traceReadRemain--;
      }
      if (traceIOAllRemain > 0 && (traceIOAllSkip === null || p !== ((traceIOAllSkip as number) & 0xff))) {
        traceReadLog.push(`pc=${hex(lastPc, 4)} port=${hex(p)} val=${hex(ret)} line=${ln} hc=${hex(hc)}`);
        traceIOAllRemain--;
      }
      if (breakIOReadMask !== null) {
        const matchVal = (ret & breakIOReadMask) >>> 0;
        const wantVal = (breakIOReadValue & breakIOReadMask) >>> 0;
        const portOk =
          breakIOReadPortMask === null
            ? true
            : (p & breakIOReadPortMask) >>> 0 === (breakIOReadPortValue & breakIOReadPortMask) >>> 0;
        if (portOk && matchVal === wantVal) brokeOn = `io-read-match p=${hex(p)} v=${hex(ret)}`;
      }
      return ret & 0xff;
    },
    writeIO8: (port: number, val: number): void => {
      const p = port & 0xff;
      lastIOPort = p;
      lastIOIsWrite = true;
      ioWriteCounts[p] = ((ioWriteCounts[p] ?? 0) + 1) >>> 0;
      if (breakIo.has(p)) brokeOn = `io-write ${p.toString(16)}`;
      // VDP control write tracking for register-write breaks and logging
      if (p === 0xbf) {
        if (vdpCtrlLatch === null) {
          vdpCtrlLatch = val & 0xff;
          vdpLogPush(`CTL low=${hex(vdpCtrlLatch)}`);
        } else {
          const second = val & 0xff;
          const low = vdpCtrlLatch & 0xff;
          // Decode code from bits 7..6 of the second byte
          const code = (second >>> 6) & 0x03;
          if (code === 0x02) {
            // Register write
            const reg = second & 0x0f;
            const data = low;
            vdpLogPush(`CTL reg R${reg}=${hex(data)}`);
            for (const br of vdpRegBreaks) {
              if (br.reg === reg && (data & br.mask) === (br.value & br.mask)) {
                brokeOn = `vdpreg R${reg}=${hex(data)}`;
                break;
              }
            }
          } else {
            const addr = (((second & 0x3f) << 8) | low) & 0x3fff;
            vdpLogPush(
              `CTL addr code=${code} hi=${hex(second)} lo=${hex(low)} addr=${hex(addr, 4)}${code === 3 ? ' CRAM' : ''}`
            );
          }
          vdpCtrlLatch = null;
        }
      }
      // Track VDP data write streaks
      if (p === 0xbe) {
        vdpDataStreak++;
        vdpDataTotal++;
        if (breakVdpDataStreakTarget > 0 && vdpDataStreak >= breakVdpDataStreakTarget) {
          brokeOn = `vdpdata-streak ${vdpDataStreak}`;
        }
        if (breakVdpDataTotalTarget > 0 && vdpDataTotal >= breakVdpDataTotalTarget) {
          brokeOn = `vdpdata-total ${vdpDataTotal}`;
        }
        if (breakOnCramWrite) {
          const gs = (vdp as any).getState?.();
          if (gs && (gs.curCode & 0x03) === 3) brokeOn = 'cram-write';
        }
      } else {
        vdpDataStreak = 0;
      }
      bus.writeIO8(p, val);
      // Post-write VDP data log
      if (p === 0xbe) {
        const gs = (vdp as any).getState?.();
        if (gs) {
          // Always log CRAM data writes; log other data writes only if vdpLogData is enabled
          if ((gs.curCode & 0x03) === 3 || vdpLogData) {
            vdpLogPush(`DATA code=${gs.curCode} addr=${hex(gs.curAddr, 4)} val=${hex(val)}`);
          }
        }
      }
    },
  };

  const cpu = createZ80({
    bus: busProxy,
    waitStates: {
      enabled: true,
      includeWaitInCycles: true,
      ioPenalty: (port: number, isWrite: boolean): number | undefined => {
        const p = port & 0xff;
        const low6 = p & 0x3f;
        // Model approximate wait-states for VDP and PSG I/O
        if (p === 0x7f) return 4; // PSG write-only (approx)
        if (p === 0x7e || p === 0x7f) return 4; // H/V counter accesses (approx)
        if (low6 === 0x3e || low6 === 0x3f) return 4; // VDP data/control mirrors (approx)
        return 0;
      },
    },
    experimentalFastBlockOps: true,
  });

  // Initialize SMS system manually (replaces BIOS)
  initializeSMS({ cpu, vdp, psg, bus: busProxy });

  const dumpRegs = (): void => {
    const s = cpu.getState();
    console.log(
      `AF=${hex((s.a << 8) | s.f, 4)} BC=${hex((s.b << 8) | s.c, 4)} DE=${hex((s.d << 8) | s.e, 4)} HL=${hex((s.h << 8) | s.l, 4)} IX=${hex(s.ix, 4)} IY=${hex(s.iy, 4)} SP=${hex(s.sp, 4)} PC=${hex(s.pc, 4)} I=${hex(s.i)} R=${hex(s.r)}`
    );
  };

  const dumpMem = (addr: number, len: number): void => {
    const a0 = addr & 0xffff;
    const bytes: string[] = [];
    for (let off = 0; off < len; off++) bytes.push(hex(bus.read8((a0 + off) & 0xffff)));
    console.log(`${hex(a0, 4)}: ${bytes.join(' ')}`);
  };

  const disasm = (addr: number, count: number): void => {
    let a = addr & 0xffff;
    for (let n = 0; n < count; n++) {
      const r = disassembleOne((ad: number): number => bus.read8(ad & 0xffff) & 0xff, a);
      const bytes = r.bytes.map((b): string => hex(b)).join(' ');
      console.log(`${hex(a, 4)}: ${r.text.padEnd(20)}  ${bytes}`);
      a = (a + r.bytes.length) & 0xffff;
    }
  };

  // Step/run helpers with break and IRQ awareness
  let lastPc = 0;
  const stepOnce = (): {
    cycles: number;
    irqA: boolean;
    nmiA: boolean;
    pcBefore: number;
    opBefore: number;
    vblankNow: boolean;
  } => {
    const pcBefore = cpu.getState().pc & 0xffff;
    lastPc = pcBefore;
    const opBefore = bus.read8(pcBefore) & 0xff;
    // PC watch logging (pre-instruction)
    if (pcWatchSet.has(pcBefore)) {
      const gs = (vdp as any).getState?.();
      const hc = gs ? (gs.lastHcRaw ?? 0) : 0;
      const ln = gs ? (gs.line ?? 0) : 0;
      pcWatchLog.push(
        `#${stepCounter} pc=${hex(pcBefore, 4)} op=${hex(opBefore)} line=${ln} hc=${hex(hc)} lastIO=${lastIOPort !== null ? hex(lastIOPort) : '--'}${lastIOIsWrite ? 'W' : 'R'}`
      );
    }
    // PC path capture (pre-instruction PC)
    if (pcPathRemain > 0) {
      pcPathLog.push(pcBefore);
      pcPathRemain--;
    }
    const { cycles, irqAccepted: irqA, nmiAccepted: nmiA } = cpu.stepOne();
    if (pcSampleInterval > 0) {
      pcSampleCounter++;
      if (pcSampleCounter >= pcSampleInterval) {
        pcSampleCounter = 0;
        bumpPcCount(pcBefore);
      }
    }
    vdp.tickCycles(cycles);
    psg.tickCycles(cycles);
    const vblankNow = vdp.hasIRQ();
    if (vblankNow) cpu.requestIRQ();
    stepCounter++;
    return { cycles, irqA, nmiA, pcBefore, opBefore, vblankNow };
  };

  const runWithBreaks = (maxSteps: number, untilIrq: boolean): void => {
    let cyc = 0;
    brokeOn = null;
    for (let k = 0; k < maxSteps; k++) {
      const { cycles, irqA, nmiA, pcBefore, opBefore, vblankNow } = stepOnce();
      cyc += cycles;
      if (breakPc.has(pcBefore)) {
        brokeOn = `pc ${pcBefore.toString(16).padStart(4, '0')}`;
        break;
      }
      if (breakOnEI && opBefore === 0xfb) {
        brokeOn = 'ei';
        break;
      }
      if (breakOps.has(opBefore)) {
        brokeOn = `op ${opBefore.toString(16).padStart(2, '0')}`;
        break;
      }
      // Break on OUT (n),A (opcode D3 nn) or OUT (C),A (opcode ED 79)
      if (opBefore === 0xd3) {
        const pn = bus.read8((pcBefore + 1) & 0xffff) & 0xff;
        if (breakOutPorts.has(pn)) {
          brokeOn = `out ${pn.toString(16).padStart(2, '0')}`;
          break;
        }
      } else if (opBefore === 0xed) {
        const op2 = bus.read8((pcBefore + 1) & 0xffff) & 0xff;
        // OUT (C),r family: ED 41,49,51,59,61,69,71,79
        if (
          op2 === 0x41 ||
          op2 === 0x49 ||
          op2 === 0x51 ||
          op2 === 0x59 ||
          op2 === 0x61 ||
          op2 === 0x69 ||
          op2 === 0x71 ||
          op2 === 0x79
        ) {
          const cport = cpu.getState().c & 0xff;
          if (breakOutPorts.has(cport)) {
            brokeOn = `outc ${cport.toString(16).padStart(2, '0')}`;
            break;
          }
        }
      }
      if (breakVBlank && vblankNow) {
        brokeOn = 'vblank';
        break;
      }
      if (breakDisplayOn) {
        const gs = (vdp as any).getState?.();
        if (gs && gs.displayEnabled) {
          brokeOn = 'display-on';
          break;
        }
      }
      if (untilIrq && (irqA || nmiA)) {
        brokeOn = irqA ? 'irq' : 'nmi';
        break;
      }
      if (brokeOn) break; // IO break was set by proxy
    }
    if (brokeOn) console.log(`break: ${brokeOn}`);
    console.log(`ran ${maxSteps} steps (or until break), cycles=${cyc}`);
  };

  // Execute commands
  i = 0;
  while (i < cmds.length) {
    const cmd = cmds[i++]!;
    switch (cmd) {
      case 'run': {
        const steps = toNum(cmds[i++]!);
        let cyc = 0;
        for (let k = 0; k < steps; k++) {
          const { cycles } = stepOnce();
          cyc += cycles;
        }
        console.log(`ran ${steps} steps, cycles=${cyc}`);
        break;
      }
      case 'cont': {
        const steps = i < cmds.length && !isNaN(Number(cmds[i])) ? toNum(cmds[i++]!) : 1000000;
        runWithBreaks(steps, false);
        break;
      }
      case 'untilirq': {
        const steps = i < cmds.length && !isNaN(Number(cmds[i])) ? toNum(cmds[i++]!) : 1000000;
        runWithBreaks(steps, true);
        break;
      }
      case 'regs':
        dumpRegs();
        break;
      case 'mem': {
        const a = cmds[i++]!;
        const l = cmds[i++]!;
        dumpMem(toNum(a), toNum(l));
        break;
      }
      case 'wmem': {
        const a = toNum(cmds[i++]!);
        const vals: number[] = [];
        while (i < cmds.length) {
          const tok = cmds[i]!;
          if (/^(0x)?[0-9a-fA-F]+$/.test(tok)) {
            vals.push(toNum(tok));
            i++;
          } else break;
        }
        for (let k = 0; k < vals.length; k++) bus.write8((a + k) & 0xffff, (vals[k] ?? 0) & 0xff);
        console.log(`wrote ${vals.length} byte(s) at ${hex(a, 4)}`);
        break;
      }
      case 'setr': {
        const rname = (cmds[i++]! || '').toLowerCase();
        const v = toNum(cmds[i++]!);
        const st = cpu.getState();
        const set8 = (k: 'a' | 'b' | 'c' | 'd' | 'e' | 'h' | 'l', val: number): void => {
          (st as any)[k] = val & 0xff;
        };
        const set16 = (k: 'ix' | 'iy' | 'sp' | 'pc', val: number): void => {
          (st as any)[k] = val & 0xffff;
        };
        if (
          rname === 'a' ||
          rname === 'b' ||
          rname === 'c' ||
          rname === 'd' ||
          rname === 'e' ||
          rname === 'h' ||
          rname === 'l'
        ) {
          set8(rname as any, v);
        } else if (rname === 'ix' || rname === 'iy' || rname === 'sp' || rname === 'pc') {
          set16(rname as any, v);
        } else if (rname === 'hl') {
          set16('ix', st.ix & 0xffff); // no-op to satisfy type
          (st as any).h = (v >>> 8) & 0xff;
          (st as any).l = v & 0xff;
        } else if (rname === 'bc') {
          (st as any).b = (v >>> 8) & 0xff;
          (st as any).c = v & 0xff;
        } else if (rname === 'de') {
          (st as any).d = (v >>> 8) & 0xff;
          (st as any).e = v & 0xff;
        } else {
          console.log(`setr: unknown register '${rname}'`);
          break;
        }
        cpu.setState(st);
        console.log(`setr ${rname}=${rname.length === 1 ? hex(v) : hex(v, 4)}`);
        break;
      }
      case 'disasm': {
        const a = cmds[i++]!;
        const n = cmds[i++]!;
        const addr = a === 'pc' ? cpu.getState().pc : toNum(a);
        disasm(addr, toNum(n));
        break;
      }
      case 'setio': {
        const p = toNum(cmds[i++]!);
        const v = toNum(cmds[i++]!);
        ioOverrides.set(p & 0xff, v & 0xff);
        console.log(`setio[${hex(p)}]=${hex(v)}`);
        break;
      }
      case 'pad': {
        const p = toNum(cmds[i++]!);
        const v = toNum(cmds[i++]!);
        if (p !== 0xdc && p !== 0xdd) {
          console.log('pad: only 0xDC or 0xDD are supported');
          process.exit(1);
        }
        padOverrides.set(p & 0xff, v & 0xff);
        console.log(`pad[${hex(p)}]=${hex(v)}`);
        break;
      }
      case 'breakpc': {
        const a = toNum(cmds[i++]!);
        breakPc.add(a & 0xffff);
        console.log(`breakpc ${hex(a, 4)}`);
        break;
      }
      case 'iocmask': {
        const dir = toNum(cmds[i++]!);
        const out = toNum(cmds[i++]!);
        (bus as any).__setIOMaskForTest?.(dir & 0xff, out & 0xff);
        console.log(`iocmask dir=${hex(dir)} out=${hex(out)}`);
        break;
      }
      case 'breakio': {
        const p = toNum(cmds[i++]!);
        breakIo.add(p & 0xff);
        console.log(`breakio ${hex(p)}`);
        break;
      }
      case 'vblankirq': {
        const onoff = cmds[i++]!;
        if (onoff === 'on') {
          // reg1 bit5 set
          vdp.writePort(0xbf, 0x20);
          vdp.writePort(0xbf, 0x80 | 0x01);
          console.log('VDP: VBlank IRQ enabled (reg1 bit5)');
        } else {
          vdp.writePort(0xbf, 0x00);
          vdp.writePort(0xbf, 0x80 | 0x01);
          console.log('VDP: VBlank IRQ disabled');
        }
        break;
      }
      case 'breakstatus': {
        breakStatusRead = true;
        console.log('breakstatus enabled');
        break;
      }
      case 'breakvblank': {
        breakVBlank = true;
        console.log('breakvblank enabled');
        break;
      }
      case 'breakdisplay': {
        breakDisplayOn = true;
        console.log('breakdisplay enabled');
        break;
      }
      case 'breakvdpreg': {
        const r = toNum(cmds[i++]!);
        const m = toNum(cmds[i++]!);
        const v = toNum(cmds[i++]!);
        vdpRegBreaks.push({ reg: r & 0x0f, mask: m & 0xff, value: v & 0xff });
        console.log(`breakvdpreg R${r & 0x0f} mask=${hex(m)} value=${hex(v)}`);
        break;
      }
      case 'breakr1disp': {
        vdpRegBreaks.push({ reg: 1, mask: 0x40, value: 0x40 });
        console.log('breakr1disp enabled');
        break;
      }
      case 'breakcramw': {
        breakOnCramWrite = true;
        console.log('breakcramw enabled');
        break;
      }
      case 'breakioread': {
        const m = toNum(cmds[i++]!);
        const v = toNum(cmds[i++]!);
        breakIOReadMask = m & 0xff;
        breakIOReadValue = v & 0xff;
        breakIOReadPortMask = null;
        console.log(`breakioread mask=${hex(m)} value=${hex(v)}`);
        break;
      }
      case 'breakioreadp': {
        const p = toNum(cmds[i++]!);
        const m = toNum(cmds[i++]!);
        const v = toNum(cmds[i++]!);
        breakIOReadMask = m & 0xff;
        breakIOReadValue = v & 0xff;
        breakIOReadPortMask = 0xff;
        breakIOReadPortValue = p & 0xff;
        console.log(`breakioreadp port=${hex(p)} mask=${hex(m)} value=${hex(v)}`);
        break;
      }
      case 'traceioreadp': {
        const p = toNum(cmds[i++]!);
        const n = toNum(cmds[i++]!);
        traceReadPort = p & 0xff;
        traceReadRemain = Math.max(1, n | 0);
        traceReadLog.length = 0;
        console.log(`traceioreadp port=${hex(p)} count=${traceReadRemain}`);
        break;
      }
      case 'traceioall': {
        const n = toNum(cmds[i++]!);
        traceIOAllRemain = Math.max(1, n | 0);
        traceIOAllSkip = null;
        traceReadLog.length = 0;
        console.log(`traceioall count=${traceIOAllRemain}`);
        break;
      }
      case 'traceioallskip': {
        const arg = cmds[i++]!;
        if (arg === 'off') {
          traceIOAllSkip = null;
          console.log('traceioallskip off');
        } else {
          const sk = toNum(arg) & 0xff;
          traceIOAllSkip = sk;
          console.log(`traceioallskip port=${hex(sk)}`);
        }
        break;
      }
      case 'showtrace': {
        if (traceReadLog.length === 0) console.log('(no trace)');
        else for (const line of traceReadLog) console.log(line);
        break;
      }
      case 'cleartrace': {
        traceReadPort = null;
        traceReadRemain = 0;
        traceReadLog.length = 0;
        traceIOAllRemain = 0;
        traceIOAllSkip = null;
        console.log('io read trace cleared');
        break;
      }
      case 'iostats': {
        // Print nonzero counters sorted by count desc
        const entries: { p: number; c: number }[] = [];
        for (let p = 0; p < 256; p++) if ((ioReadCounts[p] ?? 0) > 0) entries.push({ p, c: ioReadCounts[p] as number });
        entries.sort((a, b) => b.c - a.c);
        const line = entries.map(e => `${hex(e.p)}:${e.c}`).join(' ');
        console.log(line || '(no reads)');
        break;
      }
      case 'clearstats': {
        for (let p = 0; p < 256; p++) ioReadCounts[p] = 0;
        console.log('io read counters cleared');
        break;
      }
      case 'iowstats': {
        const entries: { p: number; c: number }[] = [];
        for (let p = 0; p < 256; p++)
          if ((ioWriteCounts[p] ?? 0) > 0) entries.push({ p, c: ioWriteCounts[p] as number });
        entries.sort((a, b) => b.c - a.c);
        const line = entries.map(e => `${hex(e.p)}:${e.c}`).join(' ');
        console.log(line || '(no writes)');
        break;
      }
      case 'cleariow': {
        for (let p = 0; p < 256; p++) ioWriteCounts[p] = 0;
        console.log('io write counters cleared');
        break;
      }
      case 'vdplog': {
        const n = i < cmds.length && !isNaN(Number(cmds[i])) ? Math.max(1, toNum(cmds[i++]!) | 0) : 64;
        const total = Math.min(n, vdpLogCount);
        const start = (vdpLogNext - vdpLogCount + vdpLogSize) % vdpLogSize;
        for (let k = 0; k < total; k++) {
          const idx = (start + (vdpLogCount - total) + k) % vdpLogSize;
          const msg = vdpLog[idx];
          if (msg) console.log(msg);
        }
        break;
      }
      case 'vdplogdata': {
        const onoff = cmds[i++]!;
        vdpLogData = onoff === 'on';
        console.log(`vdplogdata ${vdpLogData ? 'on' : 'off'}`);
        break;
      }
      case 'clearvdplog': {
        vdpLogNext = 0;
        vdpLogCount = 0;
        for (let k = 0; k < vdpLogSize; k++) vdpLog[k] = undefined;
        console.log('vdplog cleared');
        break;
      }
      case 'pcsample': {
        const arg = cmds[i++]!;
        if (arg === 'off') pcSampleInterval = 0;
        else pcSampleInterval = Math.max(1, toNum(arg) | 0);
        console.log(`pcsample ${pcSampleInterval > 0 ? `every ${pcSampleInterval} steps` : 'off'}`);
        break;
      }
      case 'pcwatch': {
        const sub = cmds[i++]!;
        if (sub === 'clear') {
          pcWatchSet.clear();
          pcWatchLog.length = 0;
          console.log('pcwatch cleared');
        } else if (sub === 'list') {
          if (pcWatchSet.size === 0) console.log('(none)');
          else
            console.log(
              Array.from(pcWatchSet)
                .map(a => hex(a, 4))
                .join(' ')
            );
        } else if (sub === 'del') {
          const a = toNum(cmds[i++]!);
          pcWatchSet.delete(a & 0xffff);
          console.log(`pcwatch del ${hex(a, 4)}`);
        } else {
          // treat token as address
          const a = toNum(sub);
          pcWatchSet.add(a & 0xffff);
          console.log(`pcwatch add ${hex(a, 4)}`);
        }
        break;
      }
      case 'showpcwatch': {
        if (pcWatchLog.length === 0) console.log('(no pcwatch hits)');
        else for (const line of pcWatchLog) console.log(line);
        break;
      }
      case 'clearpcwatch': {
        pcWatchLog.length = 0;
        console.log('pcwatch log cleared');
        break;
      }
      case 'pcpath': {
        const arg = cmds[i++]!;
        if (arg === 'off') {
          pcPathRemain = 0;
          pcPathLog.length = 0;
          console.log('pcpath off');
        } else {
          pcPathRemain = Math.max(1, toNum(arg) | 0);
          pcPathLog.length = 0;
          console.log(`pcpath capturing next ${pcPathRemain} steps`);
        }
        break;
      }
      case 'showpcpath': {
        if (pcPathLog.length === 0) console.log('(no pcpath)');
        else console.log(pcPathLog.map(pc => hex(pc, 4)).join(' -> '));
        break;
      }
      case 'clearpcpath': {
        pcPathRemain = 0;
        pcPathLog.length = 0;
        console.log('pcpath cleared');
        break;
      }
      case 'pcstats': {
        const n = i < cmds.length && !isNaN(Number(cmds[i])) ? Math.max(1, toNum(cmds[i++]!) | 0) : 20;
        const arr = Array.from(pcCounts.entries());
        arr.sort((a, b) => b[1] - a[1]);
        for (let k = 0; k < Math.min(n, arr.length); k++) {
          const [pc, c] = arr[k]!;
          console.log(`${hex(pc, 4)}: ${c}`);
        }
        if (arr.length === 0) console.log('(no samples)');
        break;
      }
      case 'clearpcstats': {
        pcCounts.clear();
        console.log('pcstats cleared');
        break;
      }
      case 'breakei': {
        breakOnEI = true;
        console.log('breakei enabled');
        break;
      }
      case 'vdp': {
        const gs = (vdp as any).getState?.();
        if (!gs) {
          console.log('VDP getState unavailable');
          break;
        }
        const regsStr = gs.regs
          .slice(0, 16)
          .map((r: number, i: number): string => `R${i}=${hex(r)}`)
          .join(' ');
        console.log(`VDP regs: ${regsStr}`);
        console.log(
          `VDP status=${hex(gs.status)} line=${gs.line}/${gs.linesPerFrame} vblankIrq=${gs.vblankIrqEnabled ? 'on' : 'off'} display=${gs.displayEnabled ? 'on' : 'off'}`
        );
        console.log(
          `VDP bases: name=${hex(gs.nameTableBase, 4)} sprAttr=${hex(gs.spriteAttrBase, 4)} sprPat=${hex(gs.spritePatternBase, 4)} border=${hex(gs.borderColor)}`
        );
        console.log(
          `VDP cur: addr=${hex(gs.curAddr, 4)} code=${hex(gs.curCode)} vramW=${gs.vramWrites} cramW=${gs.cramWrites} lastCRAM[${gs.lastCramIndex >= 0 ? hex(gs.lastCramIndex) : '--'}]=${hex(gs.lastCramValue)}`
        );
        break;
      }
      case 'vram': {
        const aStr = cmds[i++]!;
        const lStr = cmds[i++]!;
        const addr = toNum(aStr) & 0x3fff;
        const len = toNum(lStr) | 0;
        // Program VDP address for VRAM read: write low, then high (bit7 clear)
        vdp.writePort(0xbf, addr & 0xff);
        vdp.writePort(0xbf, (addr >>> 8) & 0x3f);
        // First read is buffer; discard it
        void vdp.readPort(0xbe);
        const bytes: string[] = [];
        for (let k = 0; k < len; k++) bytes.push(hex(vdp.readPort(0xbe)));
        console.log(`${hex(addr, 4)}: ${bytes.join(' ')}`);
        break;
      }
      case 'vramcur': {
        const backStr = cmds[i++]!;
        const lStr = cmds[i++]!;
        const gs = (vdp as any).getState?.();
        if (!gs) {
          console.log('VDP getState unavailable');
          break;
        }
        const back = toNum(backStr) | 0;
        const len = toNum(lStr) | 0;
        const start = (gs.curAddr - back) & 0x3fff;
        vdp.writePort(0xbf, start & 0xff);
        vdp.writePort(0xbf, (start >>> 8) & 0x3f);
        void vdp.readPort(0xbe);
        const bytes: string[] = [];
        for (let k = 0; k < len; k++) bytes.push(hex(vdp.readPort(0xbe)));
        console.log(`${hex(start, 4)}: ${bytes.join(' ')}`);
        break;
      }
      case 'cram': {
        const gs = (vdp as any).getState?.();
        if (!gs) {
          console.log('VDP getState unavailable');
          break;
        }
        const bytes = (gs.cram as number[]).map((x: number) => hex(x)).join(' ');
        console.log(`CRAM: ${bytes}`);
        break;
      }
      case 'render': {
        const gs = (vdp as any).getState?.();
        if (!gs) {
          console.log('VDP getState unavailable');
          break;
        }
        const nameBase = gs.nameTableBase & 0x3fff;
        const entries = 32 * 28; // assume mode with 2-byte entries
        // Read name table bytes
        vdp.writePort(0xbf, nameBase & 0xff);
        vdp.writePort(0xbf, (nameBase >>> 8) & 0x3f);
        void vdp.readPort(0xbe);
        const total = entries * 2;
        const nt = new Uint8Array(total);
        for (let k = 0; k < total; k++) nt[k] = vdp.readPort(0xbe) & 0xff;
        for (let row = 0; row < 28; row++) {
          const cols: string[] = [];
          for (let col = 0; col < 32; col++) {
            const idx = (row * 32 + col) * 2;
            const lo = nt[idx] ?? 0;
            const hi = nt[idx + 1] ?? 0;
            const tile = ((lo | ((hi & 0x03) << 8)) & 0x3ff) >>> 0; // 10-bit tile index
            cols.push(tile.toString(16).toUpperCase().padStart(3, '0'));
          }
          console.log(`${row.toString().padStart(2, '0')}: ${cols.join(' ')}`);
        }
        break;
      }
      case 'renderocc': {
        const gs = (vdp as any).getState?.();
        if (!gs) {
          console.log('VDP getState unavailable');
          break;
        }
        const nameBase = gs.nameTableBase & 0x3fff;
        const patBase = gs.bgPatternBase & 0x3fff;
        const entries = 32 * 28;
        // Read name table
        vdp.writePort(0xbf, nameBase & 0xff);
        vdp.writePort(0xbf, (nameBase >>> 8) & 0x3f);
        void vdp.readPort(0xbe);
        const total = entries * 2;
        const nt = new Uint8Array(total);
        for (let k = 0; k < total; k++) nt[k] = vdp.readPort(0xbe) & 0xff;
        // Helper to test if any nonzero byte in the 32-byte tile pattern
        const tileHasData = (tileIndex: number): boolean => {
          const addr = (patBase + ((tileIndex & 0x3ff) << 5)) & 0x3fff; // *32 bytes
          vdp.writePort(0xbf, addr & 0xff);
          vdp.writePort(0xbf, (addr >>> 8) & 0x3f);
          void vdp.readPort(0xbe);
          for (let i = 0; i < 32; i++) {
            if ((vdp.readPort(0xbe) & 0xff) !== 0) return true;
          }
          return false;
        };
        for (let row = 0; row < 28; row++) {
          const cols: string[] = [];
          for (let col = 0; col < 32; col++) {
            const idx = (row * 32 + col) * 2;
            const lo = nt[idx] ?? 0;
            const hi = nt[idx + 1] ?? 0;
            const tile = ((lo | ((hi & 0x03) << 8)) & 0x3ff) >>> 0;
            cols.push(tileHasData(tile) ? '##' : '..');
          }
          console.log(`${row.toString().padStart(2, '0')}: ${cols.join(' ')}`);
        }
        break;
      }
      case 'forceei': {
        const st = cpu.getState();
        (st as any).iff1 = true;
        (st as any).iff2 = true;
        cpu.setState(st);
        console.log('forceei: IFF1/IFF2 set');
        break;
      }
      case 'forceirq': {
        cpu.requestIRQ();
        console.log('forceirq: pending IRQ set');
        break;
      }
      case 'breakvdpdata': {
        const n = toNum(cmds[i++]!);
        breakVdpDataStreakTarget = Math.max(1, n | 0);
        vdpDataStreak = 0;
        console.log(`breakvdpdata streak=${breakVdpDataStreakTarget}`);
        break;
      }
      case 'breakvdpdatacount': {
        const n = toNum(cmds[i++]!);
        breakVdpDataTotalTarget = Math.max(1, n | 0);
        vdpDataTotal = 0;
        console.log(`breakvdpdatacount total=${breakVdpDataTotalTarget}`);
        break;
      }
      case 'breakop': {
        const b = toNum(cmds[i++]!);
        breakOps.add(b & 0xff);
        console.log(`breakop ${hex(b)}`);
        break;
      }
      case 'breakout': {
        const p = toNum(cmds[i++]!);
        breakOutPorts.add(p & 0xff);
        console.log(`breakout ${hex(p)}`);
        break;
      }
      case 'breakmemw': {
        const a = toNum(cmds[i++]!);
        breakMemWrite.add(a & 0xffff);
        console.log(`breakmemw ${hex(a, 4)}`);
        break;
      }
      case 'breakmemwrange': {
        const s = toNum(cmds[i++]!);
        const e = toNum(cmds[i++]!);
        const start = Math.min(s & 0xffff, e & 0xffff);
        const end = Math.max(s & 0xffff, e & 0xffff);
        breakMemWriteRanges.push({ start, end });
        console.log(`breakmemwrange ${hex(start, 4)}..${hex(end, 4)}`);
        break;
      }
      case 'breakmemwval': {
        const a = toNum(cmds[i++]!);
        const m = toNum(cmds[i++]!);
        const v = toNum(cmds[i++]!);
        breakMemWriteVals.push({ addr: a & 0xffff, mask: m & 0xff, value: v & 0xff });
        console.log(`breakmemwval ${hex(a, 4)} mask=${hex(m)} value=${hex(v)}`);
        break;
      }
      case 'findop': {
        const b = toNum(cmds[i++]!);
        const lim = i < cmds.length && !isNaN(Number(cmds[i])) ? toNum(cmds[i++]!) : 20;
        const matches: number[] = [];
        for (let a = 0; a <= 0xffff && matches.length < lim; a++) {
          if ((bus.read8(a) & 0xff) === (b & 0xff)) matches.push(a);
        }
        console.log(`findop ${hex(b)}: ${matches.map(a => hex(a, 4)).join(' ')}`);
        break;
      }
      case 'findbytes': {
        // findbytes <hex...> [limit]
        const bytes: number[] = [];
        while (i < cmds.length) {
          const tok = cmds[i]!;
          if (/^(0x)?[0-9a-fA-F]{1,2}$/.test(tok)) {
            bytes.push(toNum(tok) & 0xff);
            i++;
          } else break;
        }
        const lim = i < cmds.length && !isNaN(Number(cmds[i])) ? toNum(cmds[i++]!) : 20;
        if (bytes.length === 0) {
          console.log('findbytes: need at least one byte');
          break;
        }
        const matches: number[] = [];
        outer: for (let a = 0; a <= 0xffff && matches.length < lim; a++) {
          for (let k = 0; k < bytes.length; k++) {
            if ((bus.read8((a + k) & 0xffff) & 0xff) !== bytes[k]) continue outer;
          }
          matches.push(a);
        }
        console.log(`findbytes ${bytes.map(b => hex(b)).join(' ')}: ${matches.map(a => hex(a, 4)).join(' ')}`);
        break;
      }
      case 'satdump': {
        const gs = (vdp as any).getState?.();
        if (!gs) {
          console.log('VDP getState unavailable');
          break;
        }
        const count = (i < cmds.length && !isNaN(Number(cmds[i])) ? toNum(cmds[i++]!) : 16) | 0;
        const satBase = gs.spriteAttrBase & 0x3fff;
        // Each sprite 4 bytes; dump count entries
        vdp.writePort(0xbf, satBase & 0xff);
        vdp.writePort(0xbf, (satBase >>> 8) & 0x3f);
        void vdp.readPort(0xbe);
        for (let sidx = 0; sidx < count; sidx++) {
          const b0 = vdp.readPort(0xbe) & 0xff;
          const b1 = vdp.readPort(0xbe) & 0xff;
          const b2 = vdp.readPort(0xbe) & 0xff;
          const b3 = vdp.readPort(0xbe) & 0xff;
          console.log(`S${sidx.toString().padStart(2, '0')}: ${hex(b0)} ${hex(b1)} ${hex(b2)} ${hex(b3)}`);
        }
        break;
      }
      case 'setpc': {
        const a = toNum(cmds[i++]!);
        const st = cpu.getState();
        (st as any).pc = a & 0xffff;
        cpu.setState(st);
        console.log(`setpc ${hex(a, 4)}`);
        break;
      }
      case 'clearbreaks': {
        breakPc.clear();
        breakIo.clear();
        breakOnEI = false;
        breakStatusRead = false;
        breakVBlank = false;
        breakDisplayOn = false;
        breakOps.clear();
        breakOutPorts.clear();
        breakVdpDataStreakTarget = 0;
        vdpDataStreak = 0;
        breakVdpDataTotalTarget = 0;
        vdpDataTotal = 0;
        vdpCtrlLatch = null;
        vdpRegBreaks.length = 0;
        breakOnCramWrite = false;
        breakIOReadMask = null;
        breakIOReadPortMask = null;
        breakMemWrite.clear();
        breakMemWriteRanges.length = 0;
        breakMemWriteVals.length = 0;
        console.log('breaks cleared');
        break;
      }
      default:
        console.log(`Unknown cmd '${cmd}'.`);
        process.exit(1);
    }
  }
};

main();
