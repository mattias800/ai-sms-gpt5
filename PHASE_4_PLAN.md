# Phase 4 Plan - Real-game Validation & Optimization

**Phase Status**: INITIATED  
**Goal**: Validate SMS emulator against real games, identify and fix remaining issues, optimize performance  
**Estimated Duration**: 4-6 hours  
**Success Criteria**: All tested games execute correctly with trace validation

## Phase 4 Objectives

### Primary Objectives (Must Complete)
1. **Real-game Trace Validation**
   - Capture CPU traces from at least 2 real game ROMs
   - Compare against MAME references
   - Identify any instruction-level divergences
   - Fix any discrepancies found

2. **Game Execution Verification**
   - Wonder Boy: Boot sequence through title screen
   - Alex Kidd: Game loop execution validation
   - Sonic 1: Audio/PSG initialization check

3. **Bug Identification & Fixes**
   - Document any execution issues found
   - Root cause analysis for each issue
   - Implement targeted fixes
   - Retest until validation passes

### Secondary Objectives (Should Complete)
1. **Performance Analysis**
   - Profile CPU execution hot paths
   - Measure current performance baseline
   - Identify optimization opportunities
   - Document performance characteristics

2. **Edge Case Discovery**
   - Find edge cases through real game execution
   - Update test suite with real-world scenarios
   - Extend Phase 2 edge case tests as needed

## Execution Strategy

### Step 1: Environment Setup (30 minutes)
```bash
# Verify ROM loading and trace capture
npm run trace:capture -- ./test_rom.sms --frames 1 --verbose

# Check artifacts directory
ls -la artifacts/
```

### Step 2: Wonder Boy Validation (1-2 hours)
```bash
# Capture trace - Wonder Boy boot sequence
npm run trace:capture -- ./roms/wonderboy.sms \
  --frames 120 \
  --output artifacts/wonderboy_trace.json \
  --verbose

# Compare with MAME reference
npm run trace:compare -- artifacts/wonderboy_trace.json \
  artifacts/mame_traces/wonderboy_mame.json \
  --output artifacts/wonderboy_comparison.md

# Analyze results
cat artifacts/wonderboy_comparison.md
```

### Step 3: Alex Kidd Validation (1-2 hours)
```bash
# Capture trace - Alex Kidd
npm run trace:capture -- ./roms/alexkidd.sms \
  --frames 100 \
  --output artifacts/alexkidd_trace.json \
  --verbose

# Compare with MAME
npm run trace:compare -- artifacts/alexkidd_trace.json \
  artifacts/mame_traces/alexkidd_mame.json \
  --output artifacts/alexkidd_comparison.md
```

### Step 4: Sonic 1 Validation (1-2 hours)
```bash
# Capture trace - Sonic 1
npm run trace:capture -- ./roms/sonic1.sms \
  --frames 150 \
  --output artifacts/sonic1_trace.json \
  --verbose

# Compare with MAME
npm run trace:compare -- artifacts/sonic1_trace.json \
  artifacts/mame_traces/sonic1_mame.json \
  --output artifacts/sonic1_comparison.md
```

### Step 5: Issue Analysis & Fixes (1-2 hours)
For each divergence found:
1. Analyze trace output to identify first mismatch
2. Root cause analysis
3. Implement fix in Z80 CPU or supporting code
4. Retest with trace comparison
5. Verify fix doesn't break existing tests

### Step 6: Performance Profiling (30-45 minutes)
```bash
# Capture extended trace for performance analysis
npm run trace:capture -- ./roms/wonderboy.sms \
  --frames 300 \
  --output artifacts/wonderboy_perf_trace.json \
  --verbose

# Analyze execution patterns
# Profile hot paths
# Calculate cycles/instruction average
```

## Expected Outcomes

### Best Case (Optimistic)
- ✅ All games validate perfectly on first run
- ✅ No discrepancies found
- ✅ Performance exceeds expectations
- **Time**: 3-4 hours
- **Result**: Ready for Phase 5 (graphics/audio validation)

### Likely Case (Realistic)
- ⚠️ 1-2 minor divergences found
- ⚠️ Issue resolution requires 1-2 targeted fixes
- ⚠️ Performance optimization opportunities identified
- **Time**: 4-5 hours  
- **Result**: All games validate after fixes, ready for Phase 5

### Challenging Case (Pessimistic)
- ❌ 3-5 significant divergences found
- ❌ Requires architectural investigation
- ❌ Multiple fixes and iterations needed
- **Time**: 5-6 hours
- **Result**: Partial validation, remaining issues documented for Phase 5

## Troubleshooting Guide

### Issue: Trace capture fails
**Solution**:
```bash
# Check ROM is valid
file roms/wonderboy.sms

# Verify trace tool works with test ROM
npm run trace:capture -- ./roms/im1_test.sms --frames 1

# Check for errors in output
npm run trace:capture -- ./roms/wonderboy.sms --frames 1 --verbose 2>&1 | tail -50
```

### Issue: Trace comparison shows divergences
**Solution**:
1. Identify first instruction that diverges
2. Check CPU state at that point
3. Look for:
   - Incorrect register values
   - Wrong PC (jumped to wrong address)
   - Incorrect cycle count
   - Flag state mismatch

### Issue: Game doesn't execute properly
**Solution**:
```bash
# Test with simpler ROM first
npm run trace:capture -- ./roms/im1_test.sms --frames 5 --verbose

# Check BIOS initialization
# Review manual SMS init in sms_init.ts
# Verify VDP/PSG setup
```

## Documentation Requirements

### For Each ROM Tested
- [ ] Trace capture command used
- [ ] Number of frames/instructions captured
- [ ] Any issues encountered
- [ ] Trace divergences found (if any)
- [ ] Fixes applied (if needed)
- [ ] Final validation status (PASS/FAIL)

### Performance Data
- [ ] Average cycles per instruction
- [ ] Instructions per frame
- [ ] Hot path analysis
- [ ] Optimization candidates

### Final Report Should Include
- [ ] Games tested and results
- [ ] Issues found and fixed
- [ ] Performance baseline
- [ ] Recommendations for Phase 5
- [ ] Known limitations discovered

## Success Criteria

### Minimum (Phase 4 Pass)
- ✅ At least 2 games tested with trace capture
- ✅ Trace comparison tools working
- ✅ Any critical bugs found and documented
- ✅ Comprehensive Phase 4 report created

### Target (Phase 4 Success)
- ✅ All 3 games validated with trace comparison
- ✅ Any found issues fixed and retested
- ✅ Performance baseline documented
- ✅ Ready for Phase 5 (graphics/audio)

### Stretch (Phase 4 Excellence)
- ✅ All games perfectly validate
- ✅ Performance optimization completed
- ✅ Extended edge case tests created
- ✅ Complete root cause documentation

## Resource Requirements

### Required Files/ROMs
- Wonder Boy (wonderboy.sms)
- Alex Kidd (alexkidd.sms)
- Sonic 1 (sonic1.sms)

### Required References
- MAME traces (mock or real)
- CPU state documentation
- Game-specific documentation

### Tools Ready
- ✅ trace:capture
- ✅ trace:compare
- ✅ trace:generate-mock-mame
- ✅ npm test suite

## Next Phase (Phase 5) Preparation

Phase 4 findings will inform Phase 5 work:
- Graphics validation (VDP trace comparison)
- Audio validation (PSG trace comparison)
- Full game rendering validation
- Real-time performance validation

---

## Phase 4 Execution Checklist

- [ ] Environment verified
- [ ] Test ROMs located
- [ ] Wonder Boy trace captured and compared
- [ ] Alex Kidd trace captured and compared
- [ ] Sonic 1 trace captured and compared
- [ ] Issues analyzed and documented
- [ ] Fixes implemented (if needed)
- [ ] Retests passed
- [ ] Performance profiling completed
- [ ] Phase 4 report generated
- [ ] Ready for Phase 5

**Start Time**: [To be filled]  
**Estimated End Time**: [Current time + 4-6 hours]  
**Actual End Time**: [To be filled]
