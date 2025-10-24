# Phase 3: MAME Trace Comparison Strategy

**Objective**: Validate Z80 CPU emulator accuracy by comparing register traces against MAME (a proven reference implementation).

## Overview

Phase 3 validates that your emulator's CPU produces identical register states as MAME when executing real game ROMs. This is the **ultimate proof** of correctness—if your emulator matches MAME across diverse game code, you have confidence in production accuracy.

## Why MAME Traces?

- **MAME is the industry standard** for emulator accuracy
- **Real game code** tests complexity beyond synthetic test ROMs (ZEXDOC)
- **Interrupt-heavy sequences** exercised by actual games reveal edge cases
- **Cycle-accurate comparison** verifies timing precision

## Strategy: Three-Game Approach

We'll validate across three different games to cover diverse code patterns:

### Game 1: Alex Kidd in Miracle World
- **Why**: Simple, predictable boot sequence
- **Pattern**: Minimal interrupts, straightforward memory setup
- **Duration**: 10-50 frame window (predictable)
- **Goal**: Verify basic CPU operation

### Game 2: Sonic the Hedgehog
- **Why**: Interrupt-heavy, complex loop structures
- **Pattern**: Real-time graphics updates, multiple interrupt sources
- **Duration**: 100+ frame validation
- **Goal**: Verify interrupt handling and timing

### Game 3: Wonder Boy
- **Why**: Edge cases, special hardware interaction
- **Pattern**: Uses bank switching, complex timing
- **Duration**: Boot sequence validation
- **Goal**: Verify advanced features and boundary conditions

## Trace Capture Process

### Step 1: Prepare Our Emulator
Create `tools/trace_cpu.ts` that:
```typescript
- Loads a game ROM
- Executes up to N frames or M cycles
- Captures CPU state (registers, cycles, PC) at each instruction
- Outputs JSON trace file
```

### Step 2: Extract MAME Reference
Document how to use MAME's trace capability:
```bash
# MAME has built-in CPU trace output
mame sms -cheat -debug -rompath ./roms -trace trace.txt
# (or similar, depending on MAME version)
```

### Step 3: Compare Traces
Create `tools/compare_traces.ts` that:
```
- Loads both traces (ours + MAME)
- Aligns them by instruction count or cycle count
- Detects first divergence
- Reports detailed diff (registers, memory, flags)
- Produces pass/fail verdict
```

### Step 4: Document Results
Create comprehensive report with:
- Pass/fail for each game
- Detailed divergence analysis if found
- Recommendations for fixes

## Trace File Format

### Our Format (JSON)
```json
{
  "metadata": {
    "rom": "Alex Kidd",
    "emulator": "ai-sms-gpt5",
    "frames": 10,
    "cycles": 471600
  },
  "trace": [
    {
      "cycle": 0,
      "pc": 0x0000,
      "a": 0x00,
      "b": 0x00,
      "c": 0x00,
      "d": 0x00,
      "e": 0x00,
      "h": 0x00,
      "l": 0x00,
      "f": 0x00,
      "sp": 0x1000,
      "ix": 0x0000,
      "iy": 0x0000,
      "i": 0x00,
      "r": 0x00,
      "iff1": false,
      "iff2": false,
      "halted": false,
      "opcode": "0x00"
    },
    ...
  ]
}
```

### MAME Format (text, parsed to JSON)
Extract from MAME trace:
```
CPU: PC=0000 AF=0000 BC=0000 DE=0000 HL=0000 SP=1000 IX=0000 IY=0000 I=00 R=00
```

## Implementation Plan

### Phase 3a: Tooling (Week 1)
1. Create `tools/trace_cpu.ts` - execute ROM and capture traces
2. Create `tools/compare_traces.ts` - compare two traces
3. Create `docs/MAME_TRACE_SETUP.md` - MAME guide

### Phase 3b: Reference Data (Week 2)
1. Set up MAME in compatible environment
2. Capture reference traces for all three games
3. Store references in `artifacts/mame_traces/`

### Phase 3c: Validation (Week 3)
1. Run traces through comparison tool
2. Document any divergences
3. Analyze root causes
4. Plan fixes if needed

### Phase 3d: Reporting (Week 4)
1. Create Phase 3 validation report
2. Document any emulator improvements made
3. Summarize overall accuracy

## Expected Outcomes

### Best Case ✅
- All three game traces match MAME perfectly for first N frames
- Verdict: **"Emulator CPU is production-ready"**

### Good Case ✅
- Traces match for most operations
- Divergence found in specific edge case (e.g., NMI handling)
- Fix identified and documented for Phase 4

### Refinement Case ⚠️
- Multiple divergences found
- Systematic issues identified
- Prioritized fix list created

## Success Criteria

| Criterion | Requirement | Phase 3 Goal |
|-----------|------------|-------------|
| Alex Kidd Trace | 100% match for first 50 frames | ✅ Achieve |
| Sonic Trace | 95%+ match for interrupt sequences | ✅ Achieve |
| Wonder Boy Trace | Match complex memory access patterns | ✅ Achieve |
| Divergence Analysis | Root cause identified for any divergence | ✅ Document |
| Documentation | Setup guides + comparison results | ✅ Complete |

## Tools and Scripts

### `npm run trace:capture -- [rom] [frames]`
Capture trace from our emulator

### `npm run trace:compare -- [our-trace] [mame-trace]`
Compare two traces and report divergences

### `npm run trace:validate:all`
Validate all three game traces against MAME references

## Artifacts Generated

- `tools/trace_cpu.ts` - Trace capture tool
- `tools/compare_traces.ts` - Comparison tool
- `docs/MAME_TRACE_SETUP.md` - MAME setup guide
- `artifacts/mame_traces/` - Reference traces
- `PHASE_3_VALIDATION_REPORT.md` - Final report

## Timeline

- **Phase 3a**: Tooling - ~1-2 hours
- **Phase 3b**: Reference data - ~2-3 hours (MAME setup)
- **Phase 3c**: Validation - ~1-2 hours
- **Phase 3d**: Reporting - ~1 hour

**Total Estimated Time**: 5-8 hours

## Next Steps After Phase 3

### Phase 4: Fix Identified Issues
If divergences found:
1. Prioritize by impact
2. Create targeted fixes
3. Re-validate with traces
4. Document improvements

### Phase 5: Production Hardening
- Automated trace regression tests
- Broader game ROM coverage
- Performance optimization

## References

- MAME Documentation: https://docs.mamedev.org/
- Z80 Instruction Set: https://www.z80.info/
- SMS Hardware Specs: https://www.smspower.org/

---

**Phase 3 represents the final validation step before production deployment.** Success here means your emulator is ready for real-world use.
