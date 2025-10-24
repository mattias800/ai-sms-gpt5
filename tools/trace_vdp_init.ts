import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Trace VDP Register Initialization ===\n');

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();

let frameCount = 0;
let r1Writes = 0;
let eiCount = 0;

const CYCLES_PER_FRAME = 59736;

// Hook VDP writePort to track register writes
const originalWritePort = vdp.writePort.bind(vdp);
let latchValue: number | null = null;

vdp.writePort = function (port: number, val: number) {
  const cpuState = cpu.getState();

  if (port === 0xbf) {
    // Control port
    if (latchValue === null) {
      latchValue = val;
    } else {
      const low = latchValue;
      const high = val;
      latchValue = null;

      const code = (high >>> 6) & 0x03;
      if (code === 0x02) {
        // Register write
        const reg = high & 0x0f;
        const value = low;

        console.log(
          `\nVDP Reg ${reg} = 0x${value.toString(16).padStart(2, '0')} at PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, frame ${frameCount}`
        );

        if (reg === 0) {
          console.log(`  R0 bits: M3=${value & 0x02 ? 1 : 0}, M4=${value & 0x04 ? 1 : 0}`);
        }
        if (reg === 1) {
          r1Writes++;
          console.log(
            `  R1 bits: Display=${value & 0x40 ? 'ON' : 'OFF'}, VBlankIRQ=${value & 0x20 ? 'ON' : 'OFF'}, M1=${value & 0x10 ? 1 : 0}, M2=${value & 0x08 ? 1 : 0}`
          );
        }
      }
    }
  }

  return originalWritePort(port, val);
};

// Also track EI instructions
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const stateBefore = cpu.getState();
  const opcode = m.getBus().read8(stateBefore.pc);

  if (opcode === 0xfb) {
    // EI
    eiCount++;
    console.log(`\nEI instruction at PC=0x${stateBefore.pc.toString(16).padStart(4, '0')}, frame ${frameCount}`);
  }

  if (opcode === 0xf3) {
    // DI
    console.log(`\nDI instruction at PC=0x${stateBefore.pc.toString(16).padStart(4, '0')}, frame ${frameCount}`);
  }

  const result = originalStepOne();

  // Check if we jumped to 0x00D4 (the wait loop)
  const stateAfter = cpu.getState();
  if (stateAfter.pc === 0x00d4 && stateBefore.pc !== 0x00d4) {
    console.log(`\n!!! Reached wait loop at 0x00D4, frame ${frameCount} !!!`);
    console.log(`  IFF1: ${stateAfter.iff1}`);
    console.log(`  R1 writes so far: ${r1Writes}`);
    console.log(`  EI instructions so far: ${eiCount}`);

    const vdpState = vdp.getState?.();
    if (!vdpState) {
      console.error('VDP state not available');
      process.exit(1);
    }
    if (vdpState) {
      console.log(`  VDP R1: 0x${(vdpState.regs?.[1] ?? 0).toString(16).padStart(2, '0')}`);
      console.log(`  VDP hasIRQ: ${vdp.hasIRQ()}`);
    }
  }

  return result;
};

// Run for many frames
console.log('Running emulation...\n');

for (let frame = 0; frame < 200; frame++) {
  frameCount = frame;
  let cyclesInFrame = 0;

  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
  }

  // Stop if we hit wait loop
  const cpuState = cpu.getState();
  if (
    cpuState.pc === 0x00d4 ||
    cpuState.pc === 0x00d5 ||
    cpuState.pc === 0x00d6 ||
    cpuState.pc === 0x00d7 ||
    cpuState.pc === 0x00d8
  ) {
    console.log(`\nStopping at wait loop, frame ${frame}`);
    break;
  }

  if (frame % 60 === 0) {
    console.log(`Frame ${frame}: PC=0x${cpuState.pc.toString(16).padStart(4, '0')}, IFF1=${cpuState.iff1}`);
  }
}

console.log('\n=== Final Analysis ===');
console.log(`Total R1 writes: ${r1Writes}`);
console.log(`Total EI instructions: ${eiCount}`);

const finalVdpState = vdp?.getState?.() ?? {};
const finalCpuState = cpu.getState();
if (finalVdpState) {
  console.log(`\nFinal VDP state:`);
  console.log(`  R0: 0x${(finalVdpState.regs?.[0] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`  R1: 0x${(finalVdpState.regs?.[1] ?? 0).toString(16).padStart(2, '0')}`);
  console.log(`  Display: ${finalVdpState.displayEnabled}`);
  console.log(`  VBlank IRQ: ${finalVdpState.vblankIrqEnabled}`);
}
console.log(`\nFinal CPU state:`);
console.log(`  PC: 0x${finalCpuState.pc.toString(16).padStart(4, '0')}`);
console.log(`  IFF1: ${finalCpuState.iff1}`);
