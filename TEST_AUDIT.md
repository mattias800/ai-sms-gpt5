# Z80 CPU Test Audit & Strategy

## Executive Summary

**Current Status**: 278 tests passing, but tests were AI-generated and lack:
1. **Golden reference data** from real hardware or authoritative test ROMs
2. **Systematic coverage** of edge cases
3. **Verification against MAME/Emulicious traces**
4. **Cycle-exact timing tests** for complex scenarios
5. **Flag interaction tests** (especially undocumented F3/F5)

## Test Quality Assessment

### Strengths ✅
1. **Good structural coverage** - Most instruction groups tested
2. **Edge case attempts** - Some overflow/underflow cases tested
3. **Flag calculations** - Basic ALU flag behavior covered
4. **Interrupt basics** - EI delay, NMI priority tested
5. **Cycle counting** - Timing values verified for basic instructions

### Weaknesses ⚠️
1. **No golden reference** - Tests verify against hardcoded expected values that might be wrong
2. **Shallow interrupt testing** - Edge cases like EI+HALT interaction not fully tested
3. **Limited flag coverage** - F3/F5 undocumented bits not comprehensively tested
4. **No block operation validation** - INI/INIR/LDIR/CPIR edge cases missing
5. **R register** - Only basic increment tested, not complex prefix sequences
6. **Prefixed opcodes** - DD/FD CB combinations under-tested
7. **Error conditions** - What happens with invalid/edge-case inputs?

## Recommended Test Improvement Strategy

### Phase 1: Reference-Based Testing (High Priority)
**Goal**: Create tests with golden reference data from real Z80 hardware or ZEXDOC

#### 1a. Integrate ZEXDOC Test ROM
- **What**: Obtain ZEXDOC or similar Z80 instruction validator
- **Why**: Gold-standard instruction validation from real hardware
- **How**: 
  - Run test ROM in MAME/emulicious
  - Capture expected register/memory state
  - Create harness to run same ROM in our emulator
  - Compare cycle-by-cycle output

#### 1b. Create MAME Trace Comparison Tests
- **What**: Compare our execution traces against MAME for known programs
- **Examples**: 
  - Simple sequence: 5 instructions → verify PC, registers, cycle count
  - Interrupt scenario: IRQ at specific cycle → verify acceptance, PC, IFF state
  - Complex prefixed: DD CB 00 XX sequences → verify memory writes, cycle counts
- **Why**: MAME is battle-tested; matching it validates correctness

### Phase 2: Comprehensive Edge Case Testing (Medium Priority)

#### 2a. Interrupt Timing Edge Cases
```typescript
// Test: EI followed immediately by HALT
// Expected: IRQ should be accepted during HALT, not blocked by EI delay
test("EI; HALT allows IRQ despite EI delay");

// Test: NMI during EI delay
// Expected: NMI should bypass mask-one and be accepted
test("EI; NOP; [NMI fires here] should accept NMI");

// Test: Multiple EI in sequence
// Expected: Only first EI enables after delay
test("EI; EI; NOP; should only block for first EI");

// Test: Conditional branch within EI delay
// Expected: Branch taken/not taken but IRQ still masked
test("EI; JP Z,addr; should mask IRQ during decision");
```

#### 2b. Block Operation Edge Cases
```typescript
// LDIR: Copy 0 bytes (BC=0)
test("LDIR with BC=0 should not copy, take 16 cycles");

// CPIR: Find in empty block (BC=0)
test("CPIR with BC=0 should return immediately");

// INI: Count up from 0xFF (wrap)
test("INI multiple times should wrap B=0 correctly");

// INDR with repeat and early B=0
test("INDR with B wrapping to 0 should stop");
```

#### 2c. R Register Tracking
```typescript
// R incremented on every M1
test("R increments on base opcode fetch");
test("R increments on CB prefix fetch");
test("R increments on ED prefix fetch");
test("R increments on DD prefix fetch");
test("R increments on FD prefix fetch");

// Bit 7 preserved
test("R bit7 preserved after wrap");

// Complex sequence: DD CB d op
// Expected: R incremented 3 times (DD, CB, op)
test("DD CB op increments R three times");
```

#### 2d. Flag Consistency (F3/F5)
```typescript
// F3/F5 should reflect specific source for each instruction
test("ALU ops set F3/F5 from result");
test("BIT sets F3/F5 from operand, not result");
test("Block I/O sets F3/F5 from helper value");
test("Rotate/shift sets F3/F5 from result");
test("LD operations don't affect F3/F5 (undoc behavior)");
```

### Phase 3: Systematic Coverage Expansion (Medium Priority)

#### 3a. Instruction Coverage Matrix
Create a table with columns:
- Opcode range
- Instruction name
- Test exists (Y/N)
- Test type (unit/golden/trace)
- Coverage (basic/edge cases/full)

#### 3b. Missing Test Categories
1. **Load/Store combinations**: LD combinations with flags
2. **Arithmetic carry propagation**: Multi-byte additions with C in/out
3. **Half-carry edge cases**: Nibble boundaries in 16-bit ops
4. **Overflow/Underflow patterns**: All combinations
5. **Memory access patterns**: Different address ranges, wraparound
6. **IO port access**: Different port addresses, mirrors

### Phase 4: Automated Test Generation (Lower Priority)
- Script to extract instruction sequences from game ROMs
- Compare our state vs MAME at key points
- Flag mismatches for manual review

## How to Validate Current Tests

### Quick Win: Property-Based Testing
Use ZEXDOC or similar to generate random sequences, verify:
```typescript
// For each instruction:
// - Cycle count matches specification
// - Flags set according to spec
// - Memory/registers modified correctly
// - R register incremented appropriately
```

### Medium Effort: Trace Comparison
1. Pick a simple game (e.g., Alex Kidd intro)
2. Trace first N instructions in both MAME and our emulator
3. Compare: PC, registers, memory writes, cycles
4. Document any divergences

### High Confidence: Regression Suite
Once validated tests exist, create CI pipeline:
```bash
npm test:z80:gold       # Run against golden reference
npm test:z80:mame       # Run trace comparison
npm test:z80:unit       # Run new comprehensive unit tests
```

## Specific Test Recommendations

### 1. Create `z80_interrupt_edge_cases.test.ts`
Test all EI delay scenarios, NMI bypass, return address handling

### 2. Create `z80_block_ops_exhaustive.test.ts`
All 8 block operations × multiple starting conditions

### 3. Create `z80_flag_completeness.test.ts`
Matrix of all instructions × flag interaction combinations

### 4. Create `z80_r_register_complex.test.ts`
Multi-prefix sequences verifying R increment

### 5. Create `z80_golden_ref.test.ts`
Golden reference data from ZEXDOC or MAME traces

## Tools Needed

1. **ZEXDOC ROM** - For comprehensive instruction validation
2. **MAME trace extraction** - To get ground truth for sequences
3. **Trace comparison script** - Automated divergence detection
4. **Coverage analyzer** - Which instructions/combinations lack tests

## Timeline Recommendation

1. **Week 1**: Integrate ZEXDOC, create golden reference tests
2. **Week 2**: Add edge case tests for identified gaps
3. **Week 3**: Property-based testing and automated coverage
4. **Week 4**: Trace comparison against MAME for validation

## Success Criteria

- ✅ All ZEXDOC tests pass
- ✅ Zero divergence on MAME trace comparison for first 10,000 instructions
- ✅ >95% instruction opcode coverage in tests
- ✅ All identified edge cases tested
- ✅ CI pipeline validates all tests on each commit

## Conclusion

The current test suite provides decent baseline coverage but lacks the rigor needed for "100% accuracy" goal. Integrating golden reference data (ZEXDOC, MAME traces) would immediately raise confidence. Property-based testing of edge cases would catch subtle bugs the AI-generated tests miss.

**Recommendation**: Start with Phase 1 (ZEXDOC integration) for maximum ROI in validation confidence.
