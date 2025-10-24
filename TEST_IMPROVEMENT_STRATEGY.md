# Strategic Recommendations: Z80 CPU Test Quality Improvements

## Your Concerns Are Valid ✅

You're absolutely right: **AI-generated tests can pass while the implementation remains incorrect.** This happens when:
1. Tests verify against assumed (but wrong) expected values
2. Tests miss subtle edge cases that real hardware handles differently
3. Tests don't leverage authoritative reference data

## Your Experience Is Correct

Using **test ROMs** (ZEXALL, ZEXDOC, Sord test suite, etc.) as the golden reference is the industry-standard approach for CPU emulation validation. This is what professional projects do:
- **MAME**: Uses proprietary hardware measurements and test suites
- **Emulicious**: Uses ZEXDOC as validation baseline
- **bsnes**: Has comprehensive CPU test coverage against real hardware

## Current Test Suite Assessment

### What's Right ✅
- Basic instruction coverage exists (278 tests)
- Most instruction groups have unit tests
- Cycle counting is verified
- Some flag edge cases tested

### What's Missing ⚠️
1. **No Golden Reference Data**
   - Tests don't verify against ZEXDOC or similar authority
   - Interrupt timing checks are shallow
   - Flag calculations not validated comprehensively

2. **Edge Cases Not Fully Covered**
   - EI+HALT interaction (critical!)
   - NMI during EI delay
   - Block operation edge cases (BC=0, boundary conditions)
   - R register in complex prefix sequences

3. **No Trace Validation**
   - Not compared against MAME traces
   - No cycle-by-cycle verification
   - Memory writes not validated

## Recommended Improvement Plan

### Phase 1: Immediate (Highest ROI) - Week 1
**Integrate ZEXDOC as Golden Reference**

```bash
# If available, download ZEXDOC or similar
# Create test harness that:
# 1. Runs test ROM in our emulator
# 2. Captures final state (registers, memory, cycles)
# 3. Compares against MAME/reference implementation results
# 4. Reports any divergences
```

**Action Items:**
1. Obtain ZEXDOC test ROM (search GitHub for `z80emu` or `zexdoc`)
2. Create harness to load and run test ROM
3. Extract expected results from MAME run of same ROM
4. Add `test:z80:reference` npm script

**Expected Outcome:** Immediate validation against authoritative source

### Phase 2: Targeted Edge Cases - Week 2
**Add comprehensive tests for known problem areas**

```typescript
// Critical interrupt timing tests
test('EI; HALT: IRQ accepted immediately');
test('EI; NOP; NMI: NMI bypasses mask-one');
test('Multiple sequential EI: mask-one not reset');

// Block operations
test('LDIR BC=0: no repeat, 16 cycles');
test('CPIR BC=0: immediate exit');
test('INI with B=1: no repeat');

// R register
test('DD CB d XX: R incremented 3 times');
test('R bit7 preserved across wraparound');

// Flags
test('BIT: F3/F5 from operand, not result');
test('Rotate: F3/F5 from result');
test('Block I/O: F3/F5 from helper value');
```

**Action Items:**
1. Create `z80_interrupt_edge_cases.test.ts` (15-20 tests)
2. Create `z80_block_ops_comprehensive.test.ts` (20-30 tests)
3. Create `z80_r_register_complex.test.ts` (10-15 tests)
4. Create `z80_flags_comprehensive.test.ts` (25-35 tests)

**Expected Outcome:** 60-100 new tests covering high-risk scenarios

### Phase 3: Trace Comparison - Week 3
**Validate against MAME for known programs**

```bash
# For each test game (Alex Kidd, Sonic, etc):
# 1. Generate MAME trace: first 10,000 instructions
# 2. Run same instructions in our emulator
# 3. Compare state every 100 instructions
# 4. Flag any divergences
```

**Action Items:**
1. Create trace extraction script for MAME
2. Create trace comparison tool
3. Run against at least 3 different games
4. Document any divergences

**Expected Outcome:** Confidence that our CPU matches MAME for known sequences

### Phase 4: Regression Suite - Week 4
**Create automated validation pipeline**

```bash
npm test:z80:unit        # Existing unit tests
npm test:z80:reference   # ZEXDOC validation
npm test:z80:edge-cases  # New comprehensive edge cases
npm test:z80:mame-compare # Trace comparison
npm test:z80:all         # All validation
```

**Action Items:**
1. Create npm scripts for each validation type
2. Update CI/CD pipeline to run all validations
3. Document expected pass rate
4. Set up GitHub Actions or similar

## Specific High-Risk Tests to Add Immediately

Here are the 5 most critical tests to add **today**:

### 1. EI+HALT Interaction
```typescript
it('EI; HALT allows IRQ despite EI delay mask', () => {
  // This is critical because wrong handling breaks games with
  // interrupt-driven main loops
});
```

### 2. NMI During EI Delay
```typescript
it('NMI accepted during EI delay despite mask-one', () => {
  // Wrong behavior breaks games using NMI for pause
});
```

### 3. Block Operation BC=0
```typescript
it('LDIR with BC=0 takes 16 cycles, no repeat', () => {
  // Easy to get wrong, affects copy operations
});
```

### 4. R Register Wraparound
```typescript
it('R bit7 preserved when bits0-6 wrap', () => {
  // Subtle bug: many emulators get this wrong
});
```

### 5. BIT Instruction F3/F5
```typescript
it('BIT sets F3/F5 from operand, not result', () => {
  // Differs from other instructions, often wrong
});
```

## Tools You'll Need

### Free/Open Source
- **ZEXDOC**: Z80 instruction validator ROM
- **MAME**: For trace generation and comparison
- **Custom Python/Node script**: To extract and compare traces

### How to Get ZEXDOC
```bash
# Available on GitHub:
git clone https://github.com/anotherlin/z80emu.git
# ZEXDOC ROM is usually included in test suites
```

## Success Metrics

After implementing this plan, you should be able to claim:

✅ **"Our Z80 CPU passes all ZEXDOC tests"**
✅ **"Zero divergence with MAME for 10,000+ instruction sequences"**
✅ **"Comprehensive edge case coverage with 95%+ opcode coverage"**
✅ **"Automated regression validation on every commit"**

## My Recommendation

**Start with Phase 1 immediately.** Obtaining ZEXDOC and creating a validation harness will:
1. Take ~1-2 days
2. Give you immediate confidence boost
3. Identify any actual bugs in the CPU
4. Pay for itself in saved debugging time

Then proceed with targeted edge case tests (Phase 2) to handle known problem areas.

## Alternative: Lightweight Approach

If you can't get ZEXDOC, at minimum:
1. Pick a simple game (Alex Kidd)
2. Trace first 1,000 instructions in both MAME and our emulator
3. Compare state at key points (every 100 instructions)
4. Document divergences and fix them

This takes a few hours but gives you concrete validation.

## Conclusion

**Your instinct is sound: AI-generated tests without golden reference data are not sufficient for "100% accurate emulation" claims.**

The solution is straightforward: Add reference-based validation using ZEXDOC/MAME traces. This is the industry standard and will immediately raise confidence from "probably works" to "verified accurate."

**Next step**: Start Phase 1 (ZEXDOC integration) this week.
