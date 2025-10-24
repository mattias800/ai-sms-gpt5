import { createMachine } from '../src/machine/machine.js';
import { promises as fs } from 'fs';
import path from 'path';

interface HuntOpts {
  romPath: string;
  biosPath: string | null;
  seconds: number;
  maxSteps?: number;
}

const CPU_CLOCK_HZ = 3579545; // ~3.58 MHz

const hex2 = (v: number): string => v.toString(16).toUpperCase().padStart(2,'0');
const hex4 = (v: number): string => v.toString(16).toUpperCase().padStart(4,'0');

async function hunt(opts: HuntOpts): Promise<void> {
  const rom = new Uint8Array((await fs.readFile(opts.romPath)).buffer);
  const bios = opts.biosPath ? new Uint8Array((await fs.readFile(opts.biosPath)).buffer) : null;

  type PsgEvent = { i: number; pc: number; val: number; kind: 'latch-vol'|'latch-tone'|'latch-noise'|'data' };
  const events: PsgEvent[] = [];
  type FmEvent = { i: number; pc: number; port: number; val: number };
  const fmEvents: FmEvent[] = [];
  type VdpEvent = { i: number; pc: number; port: number; val: number };
  const vdpEvents: VdpEvent[] = [];
  type IoEvent = { i: number; pc: number; port: number; val: number };
  const ioEvents: IoEvent[] = [];

  // Track PSG latch state for classification of data bytes
  let lastLatchedReg = -1; // 0,2,4 tone; 6 noise; 1,3,5,7 volumes (we map accordingly)

  const machine = createMachine({
    cart: { rom },
    bus: { allowCartRam: true, bios },
    cpuDebugHooks: {
      onIOWrite: (port: number, val: number, pcAtWrite: number): void => {
        const p = port & 0xff;
        const b = val & 0xff;
        if (p === 0x7f) {
        if ((b & 0x80) !== 0) {
          // Latch
          const channel = (b >>> 5) & 0x03;
          const isVol = (b & 0x10) !== 0;
          const data = b & 0x0f; // eslint-disable-line @typescript-eslint/no-unused-vars
          if (isVol) {
            lastLatchedReg = (channel << 1) | 1; // 1,3,5,7
            events.push({ i: stepCount, pc: pcAtWrite & 0xffff, val: b, kind: 'latch-vol' });
          } else {
            if (channel < 3) { lastLatchedReg = channel << 1; events.push({ i: stepCount, pc: pcAtWrite & 0xffff, val: b, kind: 'latch-tone' }); }
            else { lastLatchedReg = 6; events.push({ i: stepCount, pc: pcAtWrite & 0xffff, val: b, kind: 'latch-noise' }); }
          }
        } else {
          // Data byte
          events.push({ i: stepCount, pc: pcAtWrite & 0xffff, val: b, kind: 'data' });
        }
        return;
        }
        if (p === 0xf2 || p === 0xf1 || p === 0xf0) {
          fmEvents.push({ i: stepCount, pc: pcAtWrite & 0xffff, port: p, val: b });
          return;
        }
        if (p === 0xbe || p === 0xbf) {
          vdpEvents.push({ i: stepCount, pc: pcAtWrite & 0xffff, port: p, val: b });
          return;
        }
        if (p === 0x3e || p === 0x3f) {
          ioEvents.push({ i: stepCount, pc: pcAtWrite & 0xffff, port: p, val: b });
          return;
        }
      },
    },
  });

  const cpu = machine.getCPU();
  const vdp = machine.getVDP();
  const psg = machine.getPSG();
  const pad1 = machine.getController1();
  const bus = machine.getBus();

  // Step for a requested wall-time or until max steps
  const totalCycles = Math.floor(opts.seconds * CPU_CLOCK_HZ);
  let cyclesLeft = totalCycles;
  let elapsedCycles = 0;
  let stepCount = 0;
  const maxSteps = opts.maxSteps && opts.maxSteps > 0 ? opts.maxSteps : Number.MAX_SAFE_INTEGER;

  // Optional button press window
  const pressAtMs = process.env.PRESS_MS ? parseInt(process.env.PRESS_MS,10) : 500;
  const pressForMs = process.env.PRESS_DUR_MS ? parseInt(process.env.PRESS_DUR_MS,10) : 800;
  const pressStartCycles = Math.floor((pressAtMs/1000) * CPU_CLOCK_HZ);
  const pressEndCycles = Math.floor(((pressAtMs+pressForMs)/1000) * CPU_CLOCK_HZ);

  let pressed = false;

  let irqCount = 0;
  const irqPcs: number[] = [];
  let iff1EverTrue = false;
  let sawEI = false;
  const eiPcs: number[] = [];
  while (cyclesLeft > 0 && stepCount < maxSteps) {
    // Input injection
    if (!pressed && elapsedCycles >= pressStartCycles) { pad1.setState({ button1: true }); pressed = true; }
    if (pressed && elapsedCycles >= pressEndCycles) { pad1.setState({ button1: false }); }

    // EI detection before executing the instruction
    const stBefore = cpu.getState();
    const pcBefore = stBefore.pc & 0xffff;
    const opb = bus.read8(pcBefore) & 0xff;
    if (opb === 0xFB) { sawEI = true; eiPcs.push(pcBefore); }

    const r = cpu.stepOne();
    const cycles = r.cycles;
    const st = cpu.getState();
    if (st.iff1) iff1EverTrue = true;
    if (r.irqAccepted) { irqCount++; irqPcs.push(st.pc & 0xffff); }
    vdp.tickCycles(cycles);
    psg.tickCycles(cycles);
    if (vdp.hasIRQ()) cpu.requestIRQ();
    cyclesLeft -= cycles;
    elapsedCycles += cycles;
    stepCount++;
  }

  // Summarize
  const total = events.length;
  const volLatches = events.filter((e)=>e.kind==='latch-vol');
  const toneLatches = events.filter((e)=>e.kind==='latch-tone');
  const noiseLatches = events.filter((e)=>e.kind==='latch-noise');

  console.log(`PSG writes total=${total}; volLatches=${volLatches.length}, toneLatches=${toneLatches.length}, noiseLatches=${noiseLatches.length}`);
  if (volLatches.length === 0) {
    console.log('No volume latches found.');
  } else {
    console.log('First 10 volume latches (pc,val):');
    for (let i=0;i<Math.min(10, volLatches.length);i++) {
      const e = volLatches[i]!;
      console.log(`  #${i+1} pc=${hex4(e.pc)} val=${hex2(e.val)}`);
    }
  }

  // Optionally dump raw sequence near the first few hundred writes
  const dumpCount = Math.min(64, events.length);
  console.log(`First ${dumpCount} PSG writes:`);
  for (let i=0;i<dumpCount;i++) {
    const e = events[i]!;
    console.log(`  ${i.toString().padStart(3,' ')}: pc=${hex4(e.pc)} kind=${e.kind} val=${hex2(e.val)}`);
  }

  if (fmEvents.length > 0) {
    console.log(`FM writes total=${fmEvents.length}`);
    const d = Math.min(16, fmEvents.length);
    for (let i=0;i<d;i++) {
      const e = fmEvents[i]!;
      console.log(`  fm #${i+1} pc=${hex4(e.pc)} port=${hex2(e.port)} val=${hex2(e.val)}`);
    }
  } else {
    console.log('No FM writes observed (ports F0/F1/F2).');
  }

  if (vdpEvents.length > 0) {
    console.log(`VDP writes total=${vdpEvents.length}`);
    const d = Math.min(16, vdpEvents.length);
    for (let i=0;i<d;i++) {
      const e = vdpEvents[i]!;
      console.log(`  vdp #${i+1} pc=${hex4(e.pc)} port=${hex2(e.port)} val=${hex2(e.val)}`);
    }
  } else {
    console.log('No VDP writes observed (ports BE/BF).');
  }

  if (ioEvents.length > 0) {
    console.log(`IO ctrl/mem writes total=${ioEvents.length}`);
    const d = Math.min(16, ioEvents.length);
    for (let i=0;i<d;i++) {
      const e = ioEvents[i]!;
      console.log(`  io #${i+1} pc=${hex4(e.pc)} port=${hex2(e.port)} val=${hex2(e.val)}`);
    }
  } else {
    console.log('No IO writes observed (ports 3E/3F).');
  }

  console.log(`IRQ accepts: ${irqCount}${irqPcs.length>0? ' (first few PCs: '+irqPcs.slice(0,8).map(hex4).join(', ')+')':''}`);
  console.log(`IFF1 ever true: ${iff1EverTrue}`);
  console.log(`EI executed: ${sawEI}${eiPcs.length>0? ' (first few PCs: '+eiPcs.slice(0,8).map(hex4).join(', ')+')':''}`);
}

async function main(): Promise<void> {
  const ROOT = process.cwd();
  const romEnv = process.env.SMS_ROM; if (!romEnv) { console.error('Set SMS_ROM'); process.exit(1); }
  const biosEnv = process.env.SMS_BIOS || null;
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 15;
  const maxSteps = process.env.MAX_STEPS ? parseInt(process.env.MAX_STEPS,10) : undefined;
  const romPath = path.isAbsolute(romEnv) ? romEnv : path.join(ROOT, romEnv);
  const biosPath = biosEnv ? (path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv)) : null;
  await hunt({ romPath, biosPath, seconds, maxSteps });
}

main().catch((e)=>{ console.error(e?.stack || String(e)); process.exit(1); });

