# SMS Emulator Verification Guide

## Approaches for Verifying Correctness and Cycle-Accurate Emulation

### 1. Test ROM Suites

#### ZEXALL/ZEXDOC
- **Purpose**: Comprehensive Z80 instruction testing
- **Source**: https://github.com/anotherlin/z80emu
- **What it tests**: All documented and undocumented Z80 instructions, flag behavior
- **How to use**: Run the test ROM and check for "Tests Passed" message

#### SMS VDP Test Suite
- **Purpose**: VDP functionality testing
- **Tests**: Sprite rendering, background scrolling, palette, collision detection
- **Expected output**: Visual patterns that should match reference screenshots

#### Sound Test ROMs
- **Purpose**: PSG sound chip verification
- **Tests**: Tone generation, noise channel, volume control

### 2. Instruction-Level Verification

```typescript
// Example timing verification approach
const INSTRUCTION_TIMINGS = {
  'NOP': 4,
  'LD BC,nn': 10,
  'LDIR': (bc) => bc > 0 ? 21 : 16,
  // ... complete timing table
};

function verifyTiming(instruction, actualCycles) {
  const expected = INSTRUCTION_TIMINGS[instruction];
  return actualCycles === expected;
}
```

### 3. Frame-Level Comparison

#### Tools Needed:
1. **Reference emulator** (e.g., Emulicious, MEKA, or actual hardware captures)
2. **Frame comparison tool** to check:
   - Pixel-by-pixel accuracy
   - Timing of screen updates
   - Sprite positioning

#### Implementation:
```typescript
function compareFrames(ourFrame: Uint8Array, referenceFrame: Uint8Array): number {
  let differences = 0;
  for (let i = 0; i < ourFrame.length; i++) {
    if (ourFrame[i] !== referenceFrame[i]) differences++;
  }
  return differences;
}
```

### 4. Cycle-Accurate Timing Verification

#### Key Timing Points:
- **CPU Cycles per frame**: 59,736 (NTSC) / 70,938 (PAL)
- **Cycles per scanline**: 228
- **VBlank start**: Line 192
- **HBlank duration**: ~57 cycles

#### Verification Methods:

##### A. Interrupt Timing
```typescript
// Test VBlank interrupt occurs at correct cycle
const VBLANK_CYCLE = 192 * 228; // Line 192
```

##### B. Memory Access Timing
- VRAM access: 2 cycles minimum
- ROM access: Variable based on wait states
- RAM access: 3 cycles

##### C. I/O Timing
- Port reads: 11 cycles
- Port writes: 11 cycles

### 5. Automated Test Framework

```typescript
interface TestCase {
  name: string;
  rom: Uint8Array;
  expectedState: {
    registers?: RegisterState;
    memory?: MemorySnapshot;
    cycles?: number;
    screen?: Uint8Array;
  };
  maxCycles: number;
}

class EmulatorTester {
  runTest(test: TestCase): TestResult {
    const emulator = createEmulator(test.rom);
    const result = emulator.run(test.maxCycles);
    
    return {
      passed: this.compareStates(result, test.expectedState),
      actualState: result,
      differences: this.findDifferences(result, test.expectedState)
    };
  }
}
```

### 6. Regression Testing

#### Test Categories:
1. **CPU Tests**
   - All opcodes
   - Flag behavior
   - Interrupts (NMI, IRQ)
   - Undocumented instructions

2. **VDP Tests**
   - Sprite rendering
   - Background layers
   - Scrolling
   - Palette changes
   - Status flags

3. **Memory Tests**
   - Banking
   - Mirroring
   - RAM enable/disable

4. **Timing Tests**
   - Instruction timing
   - Interrupt latency
   - DMA timing

### 7. Game-Specific Tests

#### Problem Games to Test:
- **Sonic the Hedgehog**: Tests sprite multiplexing, scrolling
- **Phantasy Star**: Complex mapper, large ROM
- **Alex Kidd**: Basic functionality baseline
- **Y's**: Tests FM sound (if implemented)

### 8. Hardware Comparison

#### Using Logic Analyzer:
1. Capture real SMS signals
2. Compare timing diagrams
3. Verify bus timing

#### Test Points:
- Z80 M1 cycle timing
- VDP /INT signal
- Memory access patterns

### 9. Continuous Integration

```yaml
# Example GitHub Actions workflow
name: Emulator Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run CPU tests
        run: npm run test:cpu
      - name: Run VDP tests  
        run: npm run test:vdp
      - name: Run game tests
        run: npm run test:games
      - name: Check timing accuracy
        run: npm run test:timing
```

### 10. Performance Metrics

#### Key Metrics to Track:
- Instructions per second
- Frame rate stability
- Audio latency
- Input lag

#### Profiling Tools:
```typescript
class PerformanceProfiler {
  private metrics = {
    instructionsExecuted: 0,
    cyclesEmulated: 0,
    framesRendered: 0,
    realTimeElapsed: 0
  };
  
  getSpeed(): number {
    return this.metrics.cyclesEmulated / 
           (this.metrics.realTimeElapsed * 3.58e6); // 3.58MHz
  }
}
```

## Implementation Priority

1. **High Priority**
   - ZEXALL test passage
   - Basic VDP timing (VBlank, HBlank)
   - Interrupt timing
   - Memory banking

2. **Medium Priority**
   - Sprite collision
   - Undocumented opcodes
   - Exact H-counter behavior

3. **Low Priority**
   - Game-specific hacks
   - Rare mapper types
   - Light gun timing

## Common Pitfalls

1. **Off-by-one timing errors** in interrupt handling
2. **Incorrect flag behavior** in ALU operations
3. **VDP status register** not clearing properly
4. **Banking** edge cases (writing to control registers)
5. **HALT instruction** behavior during interrupts

## Resources

- [SMS Power Development Wiki](https://www.smspower.org/Development/Index)
- [Z80 User Manual](http://www.z80.info/zip/z80cpu_um.pdf)
- [TMS9918 VDP Documentation](http://www.cs.columbia.edu/~sedwards/papers/TMS9918.pdf)
- [Game Compatibility Lists](https://www.smspower.org/Compatibility/)

## Testing Your Implementation

Run these verification tools in order:
```bash
# 1. Basic CPU tests
npm run test:timing

# 2. VDP timing tests  
npm run test:vdp

# 3. Full test suite
npm run test:all

# 4. Game compatibility
npm run test:games -- --game="Alex Kidd"
```

Remember: Perfect cycle accuracy isn't always necessary for good compatibility, but understanding where your emulator differs from hardware helps diagnose issues.
