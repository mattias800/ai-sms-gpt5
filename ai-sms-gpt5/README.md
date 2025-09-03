# ai-sms-gpt5 Emulator

## Z80 Interrupt Modes (IM0, IM1, IM2)

This project’s Z80 emulation supports interrupt modes IM0, IM1, and IM2 with convenient helpers for testing.

- IM1: Jumps to 0x0038 on IRQ acceptance (13 cycles). The CPU pushes PC, clears IFF1, and sets PC to 0x0038.
- IM2: Uses a vector table at (I << 8 | vector). On IRQ acceptance (19 cycles), the CPU pushes PC, clears IFF1, loads the 16-bit pointer, and sets PC to that value. The “vector” byte is provided by the device via a helper.
- IM0: Two supported models:
  1) Vector mode: behaves like a configurable RST vector (default 0x0038), 13 cycles on acceptance.
  2) Injected-opcode mode: accepts a single-byte opcode (RST xx only) and jumps to the corresponding RST target.

### API Cheatsheet

- Set IM mode via ED-prefixed opcodes in your test program:
  - IM 0: `ED 46` (or `ED 66`, `ED 76`)
  - IM 1: `ED 56`
  - IM 2: `ED 5E`

- CPU helpers available on the created CPU instance:

```ts path=null start=null
// Supply IM2 vector byte (device-provided value used to form the table index).
cpu.setIM2Vector(0xA2);

// Configure IM0 vector (RST-like target). Default is 0x0038.
cpu.setIM0Vector(0x0028);

// Inject single-byte opcode for IM0 acceptance.
// Supported: 0xC7,0xCF,0xD7,0xDF,0xE7,0xEF,0xF7,0xFF (RST 00h..38h).
// Use null to clear and return to IM0 vector mode.
cpu.setIM0Opcode(0xE7);
cpu.setIM0Opcode(null);

// Reset interrupt configuration to defaults:
// - IM0 vector: 0x0038
// - IM2 vector byte: 0xFF
// - IM0 injected opcode: cleared
cpu.resetInterruptConfig();
```

### Notes

- On IRQ acceptance, the CPU always pushes PC and clears IFF1. In IM2, acceptance costs 19 cycles; in IM0/IM1, 13 cycles.
- The IM0 injected-opcode path is intentionally limited to RST xx for simplicity. Unsupported opcodes will throw.

### Example IM2 Test Flow

```ts path=null start=null
// Program: LD A,0x40; LD I,A; IM 2; EI; NOP; HALT
mem.set([0x3E,0x40, 0xED,0x47, 0xED,0x5E, 0xFB, 0x00, 0x76], 0x0000);
// Device provides vector byte 0xA2, and table[0x40A2] = 0x1234
cpu.setIM2Vector(0xA2);
mem[0x40A2] = 0x34; // lo
mem[0x40A3] = 0x12; // hi

// Run until interrupt acceptance after EI delay
cpu.requestIRQ();
// ... step through NOP and HALT ...
const cycles = cpu.stepOne(); // accepts IM2
// cycles === 19; pc === 0x1234
```

## Z80 ED Block Operations

The emulator supports ED-prefixed block transfer and compare instructions with cycle counts and flags modeled:

- Transfer group: LDI (ED A0), LDD (ED A8), LDIR (ED B0), LDDR (ED B8)
  - Transfers one byte from (HL) to (DE)
  - LDI/LDIR: HL++, DE++  |  LDD/LDDR: HL--, DE--
  - BC := BC - 1
  - Flags: H=0, N=0; C/S/Z preserved; PV set if BC != 0 after decrement; F3/F5 from (A + transferredByte)
  - Cycles: 16 for LDI/LDD; 21 for LDIR/LDDR while repeating (BC != 0), otherwise 16 when finished

- Compare group: CPI (ED A1), CPD (ED A9), CPIR (ED B1), CPDR (ED B9)
  - Compares A with (HL) without modifying A
  - CPI/CPIR: HL++  |  CPD/CPDR: HL--
  - BC := BC - 1
  - Flags: S/Z from (A - (HL)); H from half-borrow; N=1; C preserved; PV set if BC != 0 after decrement; F3/F5 from ((A - (HL)) - H)
  - Cycles: 16 for CPI/CPD; 21 for CPIR/CPDR while repeating (BC != 0 and result != 0), otherwise 16 when finished

### Example: LDIR copies a small buffer

```ts path=null start=null
// Program:
//   LDIR
//   HALT
mem.set([0xED, 0xB0, 0x76], 0x0000);

// Prepare 2 bytes at 0x4000 to copy into 0x2000
mem[0x4000] = 0x11;
mem[0x4001] = 0x22;

const cpu = createZ80({ bus });
const st0 = cpu.getState();
cpu.setState({ ...st0, h: 0x40, l: 0x00, d: 0x20, e: 0x00, b: 0x00, c: 0x02 });

let cycles = cpu.stepOne().cycles; // first repeat
// cycles === 21
cycles = cpu.stepOne().cycles; // completes
// cycles === 16

// 0x2000..0x2001 now contain 0x11, 0x22
```

### Example: CPIR scans for a value

```ts path=null start=null
// Program:
//   CPIR
//   HALT
mem.set([0xED, 0xB1, 0x76], 0x0000);

mem[0x4000] = 0x10;
mem[0x4001] = 0x33;

const cpu = createZ80({ bus });
const st0 = cpu.getState();
cpu.setState({ ...st0, a: 0x33, h: 0x40, l: 0x00, b: 0x00, c: 0x02 });

let c = cpu.stepOne().cycles; // repeat (mismatch)
// c === 21
c = cpu.stepOne().cycles; // match
// c === 16
```

