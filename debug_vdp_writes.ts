#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { createMachine } from './src/machine/machine.js';

const main = async (): Promise<number> => {
  console.log('Debug VDP register writes during Wonder Boy execution\n');

  // Load ROM and BIOS
  const romPath = './wonderboy5.sms';
  const biosPath = './third_party/mame/roms/sms1/mpr-10052.rom';
  const rom = new Uint8Array(readFileSync(romPath));
  const bios = new Uint8Array(readFileSync(biosPath));

  const machine = createMachine({ cart: { rom }, useManualInit: false, bus: { bios } });
  const vdp = machine.getVDP();
  const cpu = machine.getCPU();

  // Hook VDP writes to track register changes
  let latchValue: number | null = null;
  let registerWrites: Array<{ frame: number, pc: number, reg: number, value: number }> = [];

  const originalWritePort = vdp.writePort.bind(vdp);
  vdp.writePort = function (port: number, val: number) {
    const cpuState = cpu.getState();
    
    if (port === 0xbf) {
      if (latchValue === null) {
        latchValue = val;
      } else {
        const low = latchValue;
        const high = val;
        latchValue = null;
        
        const code = (high >>> 6) & 0x03;
        if (code === 0x02) {
          const reg = high & 0x0f;
          const value = low;
          
          const frame = Math.floor(cpuState.cycle / ((vdp.getState?.()?.cyclesPerLine ?? 228) * (vdp.getState?.()?.linesPerFrame ?? 262)));
          registerWrites.push({
            frame,
            pc: cpuState.pc,
            reg,
            value
          });
        }
      }
    }
    
    return originalWritePort(port, val);
  };

  const st = vdp.getState?.();
  const cyclesPerLine = st?.cyclesPerLine ?? 228;
  const linesPerFrame = st?.linesPerFrame ?? 262;
  const cyclesPerFrame = cyclesPerLine * linesPerFrame;

  // Run for 600 frames and track all VDP register writes
  for (let f = 1; f <= 600; f++) {
    machine.runCycles(cyclesPerFrame);
  }

  console.log('VDP Register writes during execution:');
  registerWrites.forEach((write, i) => {
    console.log(`${i + 1}. Frame ${write.frame}, PC=0x${write.pc.toString(16).padStart(4, '0')}, R${write.reg}=0x${write.value.toString(16).padStart(2, '0')}`);
  });

  // Check specifically for R7 writes
  const r7Writes = registerWrites.filter(w => w.reg === 7);
  console.log(`\nRegister 7 writes: ${r7Writes.length}`);
  r7Writes.forEach((write, i) => {
    console.log(`R7 write ${i + 1}: Frame ${write.frame}, PC=0x${write.pc.toString(16).padStart(4, '0')}, Value=0x${write.value.toString(16).padStart(2, '0')}`);
  });

  return 0;
};

main().then(process.exit);
