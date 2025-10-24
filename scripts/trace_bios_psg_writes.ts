#!/usr/bin/env -S tsx
import { promises as fs } from 'fs';
import path from 'path';
import { createMachine } from '../src/machine/machine.js';

const CPU_CLOCK_HZ = 3_579_545;

type PsgEvent = { i: number; t: number; pc: number; val: number; kind: 'latch-vol'|'latch-tone'|'latch-noise'|'data' };

type IoEvent = { i: number; t: number; pc: number; port: number; val: number };

const main = async (): Promise<void> => {
  const ROOT = process.cwd();
  const seconds = process.env.SECONDS ? parseFloat(process.env.SECONDS) : 3.0;
  const biosEnv = process.env.SMS_BIOS || './third_party/mame/roms/sms1/mpr-10052.rom';
  const romEnv = process.env.SMS_ROM || process.env.WONDERBOY_SMS_ROM || '';
  const biosPath = path.isAbsolute(biosEnv) ? biosEnv : path.join(ROOT, biosEnv);
  await fs.access(biosPath);

  const romPath = romEnv ? (path.isAbsolute(romEnv) ? romEnv : path.join(ROOT, romEnv)) : '';
  const hasRom = romPath ? await fs.access(romPath).then(()=>true).catch(()=>false) : false;

  const cartRom = hasRom ? new Uint8Array((await fs.readFile(romPath)).buffer) : new Uint8Array(0xC000);
  const bios = new Uint8Array((await fs.readFile(biosPath)).buffer);

  let stepCount = 0;
  const psgEvents: PsgEvent[] = [];
  const ioEvents: IoEvent[] = [];
  const portStats = new Map<number, { total: number; dataBytes: number; latches: number }>();

  const mach = createMachine({
    cart: { rom: cartRom },
    bus: { allowCartRam: true, bios },
    useManualInit: false,
    cpuDebugHooks: {
      onIOWrite: (port: number, val: number, pcAtWrite: number): void => {
        const p = port & 0xff;
        const b = val & 0xff;
        const t = stepCount / CPU_CLOCK_HZ;
        const isPsgPort = (p === 0x7f || p === 0x7d || ((p & 0x01) === 0x01 && p !== 0xbf && p !== 0xf1 && p !== 0x3f));
        if (isPsgPort) {
          if ((b & 0x80) !== 0) {
            // latch
            const channel = (b >>> 5) & 0x03;
            const isVol = (b & 0x10) !== 0;
            if (isVol) { psgEvents.push({ i: stepCount, t, pc: pcAtWrite & 0xffff, val: b, kind: 'latch-vol' }); }
            else if (channel < 3) { psgEvents.push({ i: stepCount, t, pc: pcAtWrite & 0xffff, val: b, kind: 'latch-tone' }); }
            else { psgEvents.push({ i: stepCount, t, pc: pcAtWrite & 0xffff, val: b, kind: 'latch-noise' }); }
          } else {
            psgEvents.push({ i: stepCount, t, pc: pcAtWrite & 0xffff, val: b, kind: 'data' });
          }
          return;
        }
        // track stats on all IO ports to hunt for PSG data mirrors
        const s = portStats.get(p) || { total: 0, dataBytes: 0, latches: 0 };
        s.total++;
        if ((b & 0x80) === 0) s.dataBytes++;
        else s.latches++;
        portStats.set(p, s);

        if (p === 0x3e || p === 0x3f || p === 0xbe || p === 0xbf) {
          ioEvents.push({ i: stepCount, t, pc: pcAtWrite & 0xffff, port: p, val: b });
        }
      },
    },
  });

  const cpu = mach.getCPU();

  let cyclesLeft = Math.floor(seconds * CPU_CLOCK_HZ);
  while (cyclesLeft > 0) {
    const { cycles } = cpu.stepOne();
    stepCount += cycles;
    cyclesLeft -= cycles;
  }

  const latchVols = psgEvents.filter(e => e.kind==='latch-vol');
  const latchTones = psgEvents.filter(e => e.kind==='latch-tone');
  const latchNoise = psgEvents.filter(e => e.kind==='latch-noise');
  console.log(`PSG total=${psgEvents.length}; latchVol=${latchVols.length}, latchTone=${latchTones.length}, latchNoise=${latchNoise.length}, data=${psgEvents.length - latchVols.length - latchTones.length - latchNoise.length}${hasRom?` ROM=${romPath}`:''}`);

  // Print top ports by data-like writes to identify potential PSG data mirrors
  const statsArr = Array.from(portStats.entries()).map(([p, s]) => ({ p, ...s }));
  statsArr.sort((a, b) => b.dataBytes - a.dataBytes);
  console.log('Top IO ports by data-like writes (bit7=0):');
  for (const r of statsArr.slice(0, 16)) {
    const hex = r.p.toString(16).toUpperCase().padStart(2,'0');
    console.log(`  port=${hex} total=${r.total} data=${r.dataBytes} latch=${r.latches}`);
  }
};

main().catch(e => { console.error(e?.stack || String(e)); process.exit(1); });
