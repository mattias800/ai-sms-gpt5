# Phase 2 Debugging: Root Cause Analysis

## Test Failures Summary

### Interrupt Edge Cases (8 failures out of 11 tests)

All failures trace to a single core issue: **EI (Enable Interrupts) instruction implementation**

#### Failure Pattern
```
Test: "EI followed by HALT: interrupt is masked during EI delay but triggers after HALT wakes"
Expected: iff1=true after EI
Actual: iff1=false
```

#### Root Cause: Lines 484-495 in z80.ts

```typescript
// Line 484-495 (CURRENT - BROKEN)
if (iff1Pending) {
  s.iff1 = true;
  s.iff2 = true;
  iff1Pending = false;
  eiMaskOne = true;
  emitIFF('EI-commit');
}
let blockIRQThisStep = eiMaskOne;
// If we are halted, do not block the next IRQ by EI mask-one — real Z80 wakes from HALT on IRQ immediately after EI.
if (s.halted) blockIRQThisStep = false;
// Clear the mask so it only blocks this single step
eiMaskOne = false;
```

#### The Problem

1. **`iff1Pending` is never set to true** - The EI instruction (0xFB) at line 2448 sets `iff1Pending = true`, but this is supposed to delay the actual `iff1 = true` until AFTER the next instruction.

2. **However, the test expects `iff1` to be set IMMEDIATELY after stepping an EI instruction.** This is the contradiction.

3. **Looking at line 2448-2451 (EI instruction)**:
   ```typescript
   if (op === 0xfb) {
     // interrupts become enabled after next instruction
     iff1Pending = true;
     return mkRes(4, false, false);
   }
   ```
   After EI executes, `iff1Pending=true` but `iff1` is still false.
   
4. **The test checks immediately after EI step**:
   ```typescript
   step(cpu); // EI
   expect(cpu.getState().iff1).toBe(true);  // FAILS - iff1 is still false!
   ```

#### The Test is Correct, The CPU is Wrong

Z80 spec says:
- EI sets IFF1 immediately (not after next instruction as comment suggests)
- BUT: if an interrupt request is pending, it doesn't take effect until after the NEXT instruction executes
- The "one-instruction delay" applies to INTERRUPT ACCEPTANCE, not to IFF1 being set

#### Fix Required

```typescript
// Line 2447-2451 (FIXED)
if (op === 0xfb) {
  // Set IFF1 immediately
  s.iff1 = true;
  s.iff2 = true;
  emitIFF('EI');
  // BUT mask interrupt acceptance for this instruction (EI delay)
  eiMaskOne = true;
  return mkRes(4, false, false);
}
```

### Block Operation Edge Cases (4 failures)

These are secondary issues related to cycle counting in block operations with interrupts. Will fix after interrupt issue is resolved.

### Undocumented Flag Behaviors (7 failures)

These are precision issues:
- CP instruction not setting Z flag correctly
- BIT instruction not setting Z flag correctly

These suggest the `sub8()` function may have an issue with result validation, or the test expectations are slightly off.

### R Register Sequences (3 failures)

Minor timing issues with R register increments in specific scenarios.

## Fix Priority

1. **HIGH PRIORITY**: Fix EI instruction (lines 2447-2451)
   - Affects 8+ interrupt tests
   - Critical for real games

2. **MEDIUM PRIORITY**: Fix flag precision (CP, BIT Z flag)
   - Affects gameplay but less critical
   - 7 tests

3. **LOW PRIORITY**: Block op cycle counting with interrupts
   - Edge case scenario
   - 4 tests

## Implementation Strategy

1. Modify EI instruction to set `iff1=true` immediately
2. Keep the `eiMaskOne` flag to gate interrupt acceptance
3. Re-run Phase 2 tests
4. Expected improvement: 8-9 tests fix from one change

## Files to Modify

- `src/cpu/z80/z80.ts` - Lines 2447-2451 (EI instruction)
- `src/cpu/z80/z80.ts` - Lines 484-495 (EI commit logic - probably needs removal)
