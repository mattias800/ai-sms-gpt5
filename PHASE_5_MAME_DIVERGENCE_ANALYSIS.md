# Phase 5: MAME Trace Comparison Analysis

**Date**: October 22, 2025  
**Status**: DIVERGENCE DETECTED  
**Severity**: HIGH - Requires Investigation

## Executive Summary

CPU trace comparison against MAME reference emulator reveals **systematic divergence** starting at instruction 1. The divergence pattern suggests differences in:
1. **Trace Granularity**: We may be capturing intermediate CPU states
2. **Cycle Counting**: Different cycle accounting methods
3. **PC Increment Logic**: Different PC progression patterns

## Detailed Findings

### Wonder Boy Trace Comparison

**Our Trace:**
```
Instruction 0: PC=0x0000, Cycles=0
Instruction 1: PC=0x0001, Cycles=4
Instruction 2: PC=0x0003, Cycles=12
Instruction 3: PC=0x0081, Cycles=22
Instruction 4: PC=0x0084, Cycles=32
```

**MAME Reference:**
```
Instruction 0: PC=0x0000, Cycles=0, Flags=all clear
Instruction 1: PC=0x0003, Cycles=10, Flags=all clear
Instruction 2: PC=0x0004, Cycles=14, Flags=all clear
Instruction 3: PC=0x0005, Cycles=18, Flags=all clear
Instruction 4: PC=0x0007, Cycles=25, Flags=all clear
```

**Analysis:**
- Our instruction 1 (PC=1) does not appear in MAME at all
- Our instruction 2 (PC=3) matches MAME's instruction 1, but cycles differ (12 vs 10)
- PC progression is different: We go 0→1→3→129, MAME goes 0→3→4→5→7
- Cycle counts per instruction differ

### Alex Kidd Trace Comparison

**Our Trace:**
```
Instruction 0: PC=0x0000, Cycles=0
Instruction 1: PC=0x0002, Cycles=4
Instruction 2: PC=0x0003, Cycles=12
Instruction 3: PC=0x0007, Cycles=22
...
```

**MAME Reference:**
```
Instruction 0: PC=0x0000, Cycles=0
Instruction 1: PC=0x0003, Cycles=10
Instruction 2: PC=0x0004, Cycles=14
Instruction 3: PC=0x0005, Cycles=18
...
```

**Analysis:**
- Same pattern as Wonder Boy
- First divergence at instruction 1

### Pattern Analysis

**Key Observation:**
Our traces have MORE instructions than MAME (12,457 vs 5,000 for Wonder Boy). This suggests we're tracing at finer granularity—possibly including:
- EI (interrupt enable) delay states
- Intermediate instruction fetch/decode cycles
- Wait states not visible to MAME

**Hypothesis 1: EI Delay Bug**
The Z80 has a special EI delay where interrupts are not taken for 1 instruction after EI. We may be incorrectly counting this as a separate instruction.

**Hypothesis 2: Trace Point Timing**
We may be capturing CPU state at different points in the instruction cycle (early vs. late), causing PC to appear at different values.

**Hypothesis 3: Initial State Difference**
The first instruction divergence might indicate different initialization of the CPU or interrupt state.

## Root Cause Investigation

### Instruction at PC=1 (Our trace)

Looking at the SMS ROM, PC=1 is mid-instruction from PC=0. This strongly suggests:

**✅ Most Likely**: We're tracing after EACH CPU cycle tick, not after each instruction execute. This would explain why we see more states.

### Cycle Count Verification

- Our cycle 0→4: 4 cycles (instruction 0)
- MAME cycle 0→10: 10 cycles (instruction 0)

If the first instruction is a 2-byte opcode like `LD HL, (nn)` it would be 16 cycles. If it's split differently, this could account for the 6-cycle difference.

## Trace Comparison Summary

| Metric | Our Trace | MAME Trace | Status |
|--------|-----------|-----------|--------|
| Total Entries | 12,457 | 5,000 | ⚠️ 2.5x difference |
| Total Cycles | 547,224 | 20,024 | ⚠️ 27x difference |
| Cycle Accounting | Per event | Per instruction | ❌ DIVERGENT |
| PC Matching | 0.02% | - | ❌ CRITICAL |
| Trace Granularity | Fine (per tick?) | Coarse (per instr) | ⚠️ DIFFERENT |

## Impact Assessment

### CPU Correctness: UNCERTAIN
- Basic instructions execute correctly (games run without crashing)
- But PC progression and cycle accounting don't match MAME
- This could indicate:
  - ✅ We execute correctly but trace differently
  - ❌ We have subtle timing bugs
  - ⚠️ Different interpretation of what an "instruction" is

### Game Execution: ✅ VERIFIED
- All 3 games execute stably for 50 frames
- No crashes or hangs
- CPU state progression is logical
- Memory access patterns normal

## Next Steps

### Immediate (Priority 1)
1. **Verify Trace Format Semantics**: What defines an "instruction" in our trace?
2. **Check Cycle Accounting**: Review how we count and report cycles
3. **Compare ROM Disassembly**: Manually verify what instructions are at PC 0-10
4. **Check EI Delay Logic**: Verify interrupt enable delay is handled correctly

### Short Term (Priority 2)
1. Align trace granularity with MAME (trace per instruction, not per tick)
2. Verify cycle counts against Z80 manual
3. Re-run comparison with aligned traces
4. Create detailed instruction-by-instruction comparison for first 100 instructions

### Medium Term (Priority 3)
1. Compare VDP state traces if available from MAME
2. Compare PSG state if available
3. Full hardware integration testing
4. Performance validation

## Recommendations

### For Phase 5 Continuation

**Option A: Investigate & Fix (Recommended)**
- Spend 2-3 hours investigating root cause
- Fix any actual bugs found
- Re-run comparison to verify
- Continue with VDP/PSG validation with confidence

**Option B: Accept Divergence & Continue**
- Document divergence as "expected trace granularity difference"
- Focus validation on VDP/PSG where we can pixel-compare
- Skip further CPU-level MAME comparison
- Risk: CPU bugs might remain hidden

**Option C: Pause Phase 5**
- Wait for additional MAME trace data with matching granularity
- Investigate why trace formats differ
- Full stop until alignment achieved
- Risk: Delays project completion

### Recommended Path Forward

**Use Option A**: The divergence is fixable and important. Games running doesn't guarantee correct CPU emulation. We should:

1. Verify what our trace entry represents (full instruction? cycle? state?)
2. Check if our cycle accounting is correct
3. If our tracing is wrong, fix it to match instruction-based granularity
4. If our CPU is wrong, fix the bug
5. Re-run comparison to achieve >99% match rate

This will give us high confidence in CPU correctness before moving to VDP/PSG validation.

## Files Generated

- `PHASE_5_MAME_COMPARISON.json` - Raw comparison results
- `scripts/compare_mame_traces.ts` - Comparison tool
- `PHASE_5_MAME_DIVERGENCE_ANALYSIS.md` - This report

## Appendix: Data Examples

### Wonder Boy - First 5 Instructions

**Our Trace:**
```json
[
  { "instruction": 0, "pc": 0, "cycle": 0, "sp": 57328 },
  { "instruction": 1, "pc": 1, "cycle": 4, "sp": 57328 },
  { "instruction": 2, "pc": 3, "cycle": 12, "sp": 57328 },
  { "instruction": 3, "pc": 129, "cycle": 22, "sp": 57328 },
  { "instruction": 4, "pc": 132, "cycle": 32, "sp": 57328 }
]
```

**MAME Trace:**
```json
[
  { "instruction": 0, "pc": 0, "cycle": 0, "sp": 57328, "iff1": false },
  { "instruction": 1, "pc": 3, "cycle": 10, "sp": 57328, "iff1": false },
  { "instruction": 2, "pc": 4, "cycle": 14, "sp": 57328, "iff1": false },
  { "instruction": 3, "pc": 5, "cycle": 18, "sp": 57328, "iff1": false },
  { "instruction": 4, "pc": 7, "cycle": 25, "sp": 57328, "iff1": false }
]
```

---

**Status**: INVESTIGATION REQUIRED  
**Action**: Review trace granularity and CPU cycle accounting  
**Blocking**: VDP/PSG validation (can continue in parallel)
