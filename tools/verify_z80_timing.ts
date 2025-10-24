import { createMachine } from '../src/machine/machine.js';
import type { Cartridge } from '../src/bus/bus.js';

// Z80 instruction cycle counts from official documentation
// Format: [opcode, cycles, instruction_name]
const Z80_TIMING: Array<[number, number, string]> = [
  // Basic 8-bit loads
  [0x00, 4, 'NOP'],
  [0x01, 10, 'LD BC,nn'],
  [0x02, 7, 'LD (BC),A'],
  [0x03, 6, 'INC BC'],
  [0x04, 4, 'INC B'],
  [0x05, 4, 'DEC B'],
  [0x06, 7, 'LD B,n'],
  [0x07, 4, 'RLCA'],
  [0x08, 4, "EX AF,AF'"],
  [0x09, 11, 'ADD HL,BC'],
  [0x0a, 7, 'LD A,(BC)'],
  [0x0b, 6, 'DEC BC'],
  [0x0c, 4, 'INC C'],
  [0x0d, 4, 'DEC C'],
  [0x0e, 7, 'LD C,n'],
  [0x0f, 4, 'RRCA'],

  // DJNZ and JR
  [0x10, 13, 'DJNZ (B!=0)'], // 8 if no jump
  [0x18, 12, 'JR'],
  [0x20, 12, 'JR NZ (jump)'], // 7 if no jump
  [0x28, 12, 'JR Z (jump)'], // 7 if no jump
  [0x30, 12, 'JR NC (jump)'], // 7 if no jump
  [0x38, 12, 'JR C (jump)'], // 7 if no jump

  // 16-bit loads and arithmetic
  [0x11, 10, 'LD DE,nn'],
  [0x21, 10, 'LD HL,nn'],
  [0x31, 10, 'LD SP,nn'],
  [0x22, 16, 'LD (nn),HL'],
  [0x2a, 16, 'LD HL,(nn)'],
  [0x32, 13, 'LD (nn),A'],
  [0x3a, 13, 'LD A,(nn)'],

  // Stack operations
  [0xc1, 10, 'POP BC'],
  [0xc5, 11, 'PUSH BC'],
  [0xd1, 10, 'POP DE'],
  [0xd5, 11, 'PUSH DE'],
  [0xe1, 10, 'POP HL'],
  [0xe5, 11, 'PUSH HL'],
  [0xf1, 10, 'POP AF'],
  [0xf5, 11, 'PUSH AF'],

  // Calls and returns
  [0xc3, 10, 'JP nn'],
  [0xc9, 10, 'RET'],
  [0xcd, 17, 'CALL nn'],

  // I/O
  [0xd3, 11, 'OUT (n),A'],
  [0xdb, 11, 'IN A,(n)'],

  // Interrupts
  [0xf3, 4, 'DI'],
  [0xfb, 4, 'EI'],
  [0x76, 4, 'HALT'],
];

// ED-prefixed instructions
const ED_TIMING: Array<[number, number, string]> = [
  [0x40, 12, 'IN B,(C)'],
  [0x41, 12, 'OUT (C),B'],
  [0x42, 15, 'SBC HL,BC'],
  [0x43, 20, 'LD (nn),BC'],
  [0x44, 8, 'NEG'],
  [0x45, 14, 'RETN'],
  [0x46, 8, 'IM 0'],
  [0x47, 9, 'LD I,A'],
  [0x48, 12, 'IN C,(C)'],
  [0x49, 12, 'OUT (C),C'],
  [0x4a, 15, 'ADC HL,BC'],
  [0x4b, 20, 'LD BC,(nn)'],
  [0x4d, 14, 'RETI'],
  [0x4f, 9, 'LD R,A'],

  // Block instructions (cycle counts are per iteration)
  [0xa0, 16, 'LDI'],
  [0xa1, 16, 'CPI'],
  [0xa2, 16, 'INI'],
  [0xa3, 16, 'OUTI'],
  [0xa8, 16, 'LDD'],
  [0xa9, 16, 'CPD'],
  [0xaa, 16, 'IND'],
  [0xab, 16, 'OUTD'],

  // Block repeat instructions (21 cycles when repeating, 16 when done)
  [0xb0, 21, 'LDIR (repeat)'],
  [0xb1, 21, 'CPIR (repeat)'],
  [0xb2, 21, 'INIR (repeat)'],
  [0xb3, 21, 'OTIR (repeat)'],
  [0xb8, 21, 'LDDR (repeat)'],
  [0xb9, 21, 'CPDR (repeat)'],
  [0xba, 21, 'INDR (repeat)'],
  [0xbb, 21, 'OTDR (repeat)'],

  [0x56, 8, 'IM 1'],
  [0x5e, 8, 'IM 2'],
  [0x57, 9, 'LD A,I'],
  [0x5f, 9, 'LD A,R'],
];

// CB-prefixed instructions (bit operations)
const CB_TIMING: Array<[number, number, string]> = [
  // All CB instructions with register operands take 8 cycles
  [0x00, 8, 'RLC B'],
  [0x01, 8, 'RLC C'],
  [0x06, 15, 'RLC (HL)'], // (HL) variants take 15 cycles
  [0x40, 8, 'BIT 0,B'],
  [0x41, 8, 'BIT 0,C'],
  [0x46, 12, 'BIT 0,(HL)'], // BIT n,(HL) takes 12 cycles
  [0x80, 8, 'RES 0,B'],
  [0x81, 8, 'RES 0,C'],
  [0x86, 15, 'RES 0,(HL)'], // RES/SET (HL) takes 15 cycles
  [0xc0, 8, 'SET 0,B'],
  [0xc6, 15, 'SET 0,(HL)'],
];

// IX/IY-prefixed instructions (DD/FD) generally add 4 cycles
const INDEX_TIMING: Array<[number, number, string]> = [
  [0x21, 14, 'LD IX,nn'], // 10+4
  [0x22, 20, 'LD (nn),IX'], // 16+4
  [0x2a, 20, 'LD IX,(nn)'], // 16+4
  [0x23, 10, 'INC IX'], // 6+4
  [0x34, 23, 'INC (IX+d)'], // 19+4
  [0x35, 23, 'DEC (IX+d)'], // 19+4
  [0x36, 19, 'LD (IX+d),n'], // 15+4
  [0x46, 19, 'LD B,(IX+d)'], // 15+4
  [0x70, 19, 'LD (IX+d),B'], // 15+4
  [0xe1, 14, 'POP IX'], // 10+4
  [0xe5, 15, 'PUSH IX'], // 11+4
];

function createTestRom(instructions: Uint8Array): Cartridge {
  const rom = new Uint8Array(0x4000);
  // Copy instructions starting at 0x0000
  for (let i = 0; i < instructions.length && i < rom.length; i++) {
    rom[i] = instructions[i];
  }
  // Add HALT at the end
  if (instructions.length < rom.length) {
    rom[instructions.length] = 0x76;
  }
  return { rom };
}

function testInstructionTiming(opcode: number, expectedCycles: number, name: string, prefix?: number): boolean {
  // Special handling for conditional jumps - need to set up flags
  if (name.includes('JR') && name.includes('jump')) {
    const rom = new Uint8Array(0x4000);
    let addr = 0;

    // Set up the appropriate flag
    let setupInstructions = 0;
    if (name.includes('NZ')) {
      // Need Z flag clear
      rom[addr++] = 0x3e;
      rom[addr++] = 0x01; // LD A,1 - clears Z flag
      setupInstructions = 1;
    } else if (name.includes('Z')) {
      rom[addr++] = 0xaf; // XOR A - sets Z flag
      setupInstructions = 1;
    } else if (name.includes('NC')) {
      // Need C flag clear
      rom[addr++] = 0xa7; // AND A - clears carry flag
      setupInstructions = 1;
    } else if (name.includes('C')) {
      rom[addr++] = 0x37; // SCF - sets carry flag
      setupInstructions = 1;
    }

    rom[addr++] = opcode; // The JR instruction
    rom[addr++] = 0x02; // displacement
    rom[addr++] = 0x00; // NOP
    rom[addr++] = 0x00; // NOP
    rom[addr++] = 0x76; // HALT (target)

    const cart = { rom };
    const m = createMachine({ cart, fastBlocks: false });
    const cpu = m.getCPU();

    // Execute flag setup instructions
    for (let i = 0; i < setupInstructions; i++) {
      cpu.stepOne();
    }

    // Execute the JR
    const result = cpu.stepOne();
    const passed = result.cycles === expectedCycles;

    if (!passed) {
      console.log(
        `❌ ${name} (0x${opcode.toString(16).padStart(2, '0')}): Expected ${expectedCycles} cycles, got ${result.cycles}`
      );
    }

    return passed;
  }

  const instructions =
    prefix !== undefined
      ? new Uint8Array([prefix, opcode, 0x00, 0x00, 0x76]) // Prefixed instruction
      : new Uint8Array([opcode, 0x00, 0x00, 0x76]); // Regular instruction

  const cart = createTestRom(instructions);
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();

  // Step once to execute the instruction
  const result = cpu.stepOne();

  const expected = prefix !== undefined ? expectedCycles : expectedCycles;
  const passed = result.cycles === expected;

  if (!passed) {
    const fullOpcode =
      prefix !== undefined
        ? `${prefix.toString(16).padStart(2, '0')} ${opcode.toString(16).padStart(2, '0')}`
        : opcode.toString(16).padStart(2, '0');
    console.log(`❌ ${name} (0x${fullOpcode}): Expected ${expected} cycles, got ${result.cycles}`);
  }

  return passed;
}

console.log('=== Z80 Instruction Timing Verification ===\n');

let totalTests = 0;
let passedTests = 0;

// Test basic instructions
console.log('Testing basic instructions...');
for (const [opcode, cycles, name] of Z80_TIMING) {
  totalTests++;
  if (testInstructionTiming(opcode, cycles, name)) {
    passedTests++;
  }
}

// Test ED-prefixed instructions
console.log('\nTesting ED-prefixed instructions...');
for (const [opcode, cycles, name] of ED_TIMING) {
  totalTests++;
  if (testInstructionTiming(opcode, cycles, name, 0xed)) {
    passedTests++;
  }
}

// Test CB-prefixed instructions
console.log('\nTesting CB-prefixed instructions...');
for (const [opcode, cycles, name] of CB_TIMING) {
  totalTests++;
  if (testInstructionTiming(opcode, cycles, name, 0xcb)) {
    passedTests++;
  }
}

// Test DD-prefixed (IX) instructions
console.log('\nTesting DD-prefixed (IX) instructions...');
for (const [opcode, cycles, name] of INDEX_TIMING) {
  totalTests++;
  if (testInstructionTiming(opcode, cycles, name, 0xdd)) {
    passedTests++;
  }
}

// Summary
console.log(`\n=== Summary ===`);
console.log(`Passed: ${passedTests}/${totalTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
if (passedTests === totalTests) {
  console.log('✅ All instruction timing tests passed!');
} else {
  console.log(`❌ ${totalTests - passedTests} instruction timing tests failed`);
}

// Test specific timing-critical sequences
console.log('\n=== Testing timing-critical sequences ===');

// Test LDIR timing (should be 21 cycles per iteration except last)
function testLDIRTiming(): void {
  const rom = new Uint8Array(0x4000);
  // Set up LDIR: HL=0x1000, DE=0x2000, BC=3
  rom[0x0000] = 0x21;
  rom[0x0001] = 0x00;
  rom[0x0002] = 0x10; // LD HL,0x1000
  rom[0x0003] = 0x11;
  rom[0x0004] = 0x00;
  rom[0x0005] = 0x20; // LD DE,0x2000
  rom[0x0006] = 0x01;
  rom[0x0007] = 0x03;
  rom[0x0008] = 0x00; // LD BC,0x0003
  rom[0x0009] = 0xed;
  rom[0x000a] = 0xb0; // LDIR
  rom[0x000b] = 0x76; // HALT

  const cart = { rom };
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();

  // Skip setup instructions
  cpu.stepOne(); // LD HL
  cpu.stepOne(); // LD DE
  cpu.stepOne(); // LD BC

  // Execute LDIR - need multiple steps as it repeats
  let totalCycles = 0;
  let iterations = 0;

  while (iterations < 5) {
    const result = cpu.stepOne();
    totalCycles += result.cycles;
    iterations++;

    const state = cpu.getState();
    const bc = (state.b << 8) | state.c;

    if (bc === 0) {
      break;
    }
  }

  // LDIR with BC=3 should take: 21+21+16 = 58 cycles
  const expectedCycles = 21 + 21 + 16;
  if (totalCycles === expectedCycles) {
    console.log(`✅ LDIR timing correct: ${totalCycles} cycles for BC=3`);
  } else {
    console.log(`❌ LDIR timing incorrect: Expected ${expectedCycles} cycles, got ${totalCycles}`);
  }
}

testLDIRTiming();

// Test interrupt acknowledgment timing
function testInterruptTiming(): void {
  console.log('\n=== Testing interrupt timing ===');
  const rom = new Uint8Array(0x4000);

  // Interrupt vector at 0x0038
  rom[0x0038] = 0xc9; // RET

  // Main code
  rom[0x0000] = 0xfb; // EI
  rom[0x0001] = 0x00; // NOP
  rom[0x0002] = 0x00; // NOP (interrupt should occur here)
  rom[0x0003] = 0x76; // HALT

  const cart = { rom };
  const m = createMachine({ cart, fastBlocks: false });
  const cpu = m.getCPU();

  cpu.stepOne(); // EI
  cpu.stepOne(); // NOP

  // Request interrupt
  cpu.requestIRQ();

  // Step should handle interrupt (13 cycles for IM1 interrupt acknowledgment)
  const intResult = cpu.stepOne();

  // Interrupt acknowledgment in IM1 should take 13 cycles
  if (intResult.cycles >= 13) {
    console.log(`✅ Interrupt acknowledgment timing: ${intResult.cycles} cycles`);
  } else {
    console.log(`❌ Interrupt acknowledgment timing incorrect: ${intResult.cycles} cycles (expected ≥13)`);
  }
}

testInterruptTiming();
