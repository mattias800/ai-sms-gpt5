import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

const romFile = './Alex Kidd - The Lost Stars (UE) [!].sms';
const rom = new Uint8Array(readFileSync(romFile));

console.log('=== Analyzing VDP Write at PC 0x02D3 ===\n');

// Check the ROM directly at that location
console.log('ROM bytes around 0x02D3:');
for (let addr = 0x02d0; addr <= 0x02d8; addr++) {
  const byte = rom[addr] ?? 0;
  console.log(`  0x${addr.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')} (${byte})`);
}

// Create machine and run until we hit that PC
const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

const cpu = m.getCPU();
const vdp = m.getVDP();
const bus = m.getBus();

let targetHit = false;
let frameCount = 0;
const CYCLES_PER_FRAME = 59736;

// Hook CPU stepOne
const originalStepOne = cpu.stepOne.bind(cpu);
cpu.stepOne = function () {
  const state = cpu.getState();

  // Check if we're at or near 0x02D3
  if (state.pc >= 0x02d0 && state.pc <= 0x02d8 && !targetHit) {
    console.log(`\nAt PC=0x${state.pc.toString(16).padStart(4, '0')}:`);

    // Disassemble the instruction
    const byte1 = bus.read8(state.pc);
    const byte2 = bus.read8((state.pc + 1) & 0xffff);
    const byte3 = bus.read8((state.pc + 2) & 0xffff);

    console.log(
      `  Bytes: ${byte1.toString(16).padStart(2, '0')} ${byte2.toString(16).padStart(2, '0')} ${byte3.toString(16).padStart(2, '0')}`
    );

    // Decode common instructions
    if (byte1 === 0xd3) {
      console.log(`  Instruction: OUT (${byte2.toString(16).padStart(2, '0')}), A`);
      console.log(`  A register: 0x${state.a.toString(16).padStart(2, '0')}`);
    } else if (byte1 === 0xed && byte2 === 0xb3) {
      console.log(`  Instruction: OTIR`);
      const hl = (state.h << 8) | state.l;
      console.log(
        `  HL=0x${hl.toString(16).padStart(4, '0')}, B=${state.b}, C=0x${state.c.toString(16).padStart(2, '0')}`
      );
    } else if (byte1 === 0xed && byte2 === 0xa3) {
      console.log(`  Instruction: OUTI`);
      const hl = (state.h << 8) | state.l;
      console.log(
        `  HL=0x${hl.toString(16).padStart(4, '0')}, B=${state.b}, C=0x${state.c.toString(16).padStart(2, '0')}`
      );
    } else if (byte1 === 0x76) {
      console.log(`  Instruction: HALT`);
    } else if (byte1 === 0xc3) {
      const addr = byte2 | (byte3 << 8);
      console.log(`  Instruction: JP 0x${addr.toString(16).padStart(4, '0')}`);
    } else if (byte1 === 0xcd) {
      const addr = byte2 | (byte3 << 8);
      console.log(`  Instruction: CALL 0x${addr.toString(16).padStart(4, '0')}`);
    } else if (byte1 === 0xc9) {
      console.log(`  Instruction: RET`);
    } else if (byte1 === 0x3e) {
      console.log(`  Instruction: LD A, 0x${byte2.toString(16).padStart(2, '0')}`);
    } else if (byte1 === 0x21) {
      const addr = byte2 | (byte3 << 8);
      console.log(`  Instruction: LD HL, 0x${addr.toString(16).padStart(4, '0')}`);
    } else if (byte1 === 0x06) {
      console.log(`  Instruction: LD B, 0x${byte2.toString(16).padStart(2, '0')}`);
    } else if (byte1 === 0x0e) {
      console.log(`  Instruction: LD C, 0x${byte2.toString(16).padStart(2, '0')}`);
    } else if ((byte1 & 0xc7) === 0x04) {
      const reg = (byte1 >> 3) & 7;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      console.log(`  Instruction: INC ${regNames[reg]}`);
    } else if ((byte1 & 0xc7) === 0x05) {
      const reg = (byte1 >> 3) & 7;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
      console.log(`  Instruction: DEC ${regNames[reg]}`);
    } else if (byte1 === 0x10) {
      const disp = (byte2 << 24) >> 24; // Sign extend
      console.log(
        `  Instruction: DJNZ ${disp >= 0 ? '+' : ''}${disp} (to 0x${((state.pc + 2 + disp) & 0xffff).toString(16).padStart(4, '0')})`
      );
    }

    console.log(
      `  Registers: A=${state.a.toString(16).padStart(2, '0')} B=${state.b} C=${state.c.toString(16).padStart(2, '0')} HL=${((state.h << 8) | state.l).toString(16).padStart(4, '0')}`
    );

    if (state.pc === 0x02d3) {
      targetHit = true;

      // Check what's in RAM/ROM where HL points
      const hl = (state.h << 8) | state.l;
      if (state.b > 0) {
        console.log(`\n  Data at HL=0x${hl.toString(16)} (first 16 bytes):`);
        const data = [];
        for (let i = 0; i < Math.min(16, state.b); i++) {
          data.push(
            bus
              .read8((hl + i) & 0xffff)
              .toString(16)
              .padStart(2, '0')
          );
        }
        console.log(`    ${data.join(' ')}`);
      }
    }
  }

  return originalStepOne();
};

// Run emulation
console.log('\nRunning emulation...\n');

for (let frame = 0; frame < 100 && !targetHit; frame++) {
  frameCount = frame;
  let cyclesInFrame = 0;

  while (cyclesInFrame < CYCLES_PER_FRAME) {
    const result = cpu.stepOne();
    cyclesInFrame += result.cycles;
  }
}

if (!targetHit) {
  console.log(`Did not reach PC 0x02D3 in ${frameCount} frames.`);
} else {
  console.log(`\nHit target PC at frame ${frameCount}.`);
}
