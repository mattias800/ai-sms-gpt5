import { readFileSync } from 'fs';
import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

console.log('=== Testing OTIR Block I/O ===\n');

// Create a minimal test ROM with OTIR instruction
const rom = new Uint8Array(0x8000);

// Program at 0x0000:
// LD HL, 0x4000  (21 00 40)
// LD B, 32       (06 20)
// LD C, 0xBE     (0E BE)
// OTIR           (ED B3)
// HALT           (76)
rom[0x0000] = 0x21;
rom[0x0001] = 0x00;
rom[0x0002] = 0x40; // LD HL, 0x4000
rom[0x0003] = 0x06;
rom[0x0004] = 0x20; // LD B, 32
rom[0x0005] = 0x0e;
rom[0x0006] = 0xbe; // LD C, 0xBE
rom[0x0007] = 0xed;
rom[0x0008] = 0xb3; // OTIR
rom[0x0009] = 0x76; // HALT

// Fill test data at 0x4000 - ascending pattern
for (let i = 0; i < 32; i++) {
  rom[0x4000 + i] = i + 0x80; // 0x80, 0x81, 0x82, ...
}

const cart: Cartridge = { rom };
const m = createMachine({ cart, fastBlocks: false });

console.log('Initial state:');
const cpu = m.getCPU();
const bus = m.getBus();
const vdp = m.getVDP();

// Track VDP writes
const vramWrites: Array<{ addr: number; val: number }> = [];
const currentVramAddr = 0;

// Override VDP writePort to track writes
const originalWritePort = vdp.writePort.bind(vdp);
vdp.writePort = function (port: number, val: number) {
  if (port === 0xbe) {
    // Data port
    const state = vdp.getState ? vdp.getState?.() : undefined;
    if (state) {
      vramWrites.push({ addr: state.curAddr, val });
      console.log(
        `  VDP write: VRAM[0x${state.curAddr.toString(16).padStart(4, '0')}] = 0x${val.toString(16).padStart(2, '0')}`
      );
    }
  }
  return originalWritePort(port, val);
};

// Set up VDP for VRAM write mode
console.log('\nSetting up VDP for VRAM writes at address 0x0000...');
// Write control port to set address 0x0000 with code 01 (VRAM write)
// First byte (low): 0x00
// Second byte (high): 0x40 (01 00 0000 -> code 01, address bits 13-8 = 0)
vdp.writePort(0xbf, 0x00);
vdp.writePort(0xbf, 0x40);

console.log('\nRunning OTIR instruction...');
// Run the program
for (let i = 0; i < 100 && !cpu.getState().halted; i++) {
  const result = cpu.stepOne();
  const state = cpu.getState();
  console.log(
    `Step ${i}: PC=0x${state.pc.toString(16).padStart(4, '0')}, HL=0x${((state.h << 8) | state.l).toString(16).padStart(4, '0')}, B=${state.b}, cycles=${result.cycles}`
  );

  if (state.pc === 0x0007) {
    // About to execute OTIR
    console.log('  Before OTIR: HL points to test data');
  }
}

console.log('\n=== Analysis ===');
console.log(`Total VRAM writes: ${vramWrites.length}`);

if (vramWrites.length > 0) {
  console.log('First 10 writes:');
  for (let i = 0; i < Math.min(10, vramWrites.length); i++) {
    const w = vramWrites[i]!;
    console.log(`  [${i}] VRAM[0x${w.addr.toString(16).padStart(4, '0')}] = 0x${w.val.toString(16).padStart(2, '0')}`);
  }

  // Check pattern
  console.log('\nPattern analysis:');
  let ascending = true;
  let sameValue = true;
  const firstVal = vramWrites[0]?.val ?? 0;

  for (let i = 1; i < vramWrites.length; i++) {
    if (vramWrites[i]!.val !== vramWrites[i - 1]!.val + 1) {
      ascending = false;
    }
    if (vramWrites[i]!.val !== firstVal) {
      sameValue = false;
    }
  }

  if (sameValue) {
    console.log('  ERROR: All values are the same! OTIR is not incrementing HL correctly.');
  } else if (ascending) {
    console.log('  OK: Values are ascending as expected.');
  } else {
    console.log('  WARNING: Values are not in ascending order.');
  }

  // Check address increments
  const addrDeltas = new Set<number>();
  for (let i = 1; i < vramWrites.length; i++) {
    const delta = (vramWrites[i]!.addr - vramWrites[i - 1]!.addr + 0x4000) & 0x3fff;
    addrDeltas.add(delta);
  }
  console.log(`\nVRAM address increments: ${Array.from(addrDeltas).join(', ')}`);

  // Check VDP state
  const vdpState = vdp.getState ? vdp.getState?.() : undefined;
  if (vdpState) {
    console.log(`\nVDP R15 (auto-increment): ${vdpState.regs?.[15] ?? 0 ?? 0}`);
  }
}

const finalState = cpu.getState();
console.log(
  `\nFinal CPU state: PC=0x${finalState.pc.toString(16).padStart(4, '0')}, HL=0x${((finalState.h << 8) | finalState.l).toString(16).padStart(4, '0')}, B=${finalState.b}`
);
