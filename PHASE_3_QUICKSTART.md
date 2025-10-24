# Phase 3: MAME Trace Comparison - Quick Start Guide

## Overview

Phase 3 validates that your Z80 CPU emulator produces **identical register states** as MAME (the industry-standard reference implementation) when executing real game ROMs.

**Why this matters**: If your emulator matches MAME across real games, you have absolute proof of CPU correctness.

## What's New in Phase 3

### Phase 3a: Tooling ✅ COMPLETE

Three new tools have been created:

1. **`tools/trace_cpu.ts`** - Captures CPU register traces from our emulator
   ```bash
   tsx tools/trace_cpu.ts <rom_path> --frames 50 --output artifacts/trace_ours.json
   ```

2. **`tools/compare_traces.ts`** - Compares our traces against MAME references
   ```bash
   tsx tools/compare_traces.ts <our-trace> <mame-trace> --output report.md
   ```

3. **`docs/MAME_TRACE_SETUP.md`** - Complete guide for extracting MAME traces
   - How to install MAME
   - How to use MAME debugger for trace capture
   - Automation scripts and examples

### Phase 3b: Reference Data (Next)

You'll need MAME trace references. Three options:

**Option 1: Use Existing MAME Installation** (Fastest)
```bash
# If you have MAME installed
mame sms -debug -rompath ./roms -nowindow
# Then in debugger: trace trace_output.txt
```

**Option 2: Install MAME** (5-10 minutes)
```bash
# macOS
brew install mame

# Linux
sudo apt-get install mame
```

**Option 3: Mock Reference Data** (Quick Testing)
```bash
# Generate sample MAME reference traces for testing the tools
npm run trace:generate-mock-mame
```

### Phase 3c & 3d: Validation and Reporting (After References)

Once reference traces are available, run:
```bash
# Capture our emulator's trace
npm run trace:capture -- ./roms/alexkidd.sms --frames 50

# Compare against MAME reference
npm run trace:compare -- ./artifacts/trace_ours.json ./artifacts/trace_mame.json

# Generate full report
npm run trace:report
```

## Quick Start Workflow

### Step 1: Install MAME (if needed)

```bash
# macOS
brew install mame

# Verify
mame -version
```

See `docs/MAME_TRACE_SETUP.md` for detailed platform-specific instructions.

### Step 2: Capture MAME Reference Traces

Choose one of three games:

**Option A: Alex Kidd (Simplest)**
```bash
# Takes ~2 minutes, produces smallest trace
mame sms alexkidd -debug -rompath ./roms -nowindow

# In MAME debugger:
# trace artifacts/mame_traces/alexkidd_mame.txt
# [Let it run for ~50 frames]
# Ctrl+C to stop
```

**Option B: Sonic the Hedgehog (Most Complex)**
```bash
mame sms sonic1 -debug -rompath ./roms -nowindow

# In MAME debugger:
# trace artifacts/mame_traces/sonic_mame.txt
# [Let it run for ~100 frames]
```

**Option C: Mock Data (For Testing)**
```bash
# Generate sample reference traces (no MAME needed)
npm run trace:generate-mock-mame
```

### Step 3: Capture Our Emulator Traces

```bash
# Capture trace from our emulator
npm run trace:capture -- ./roms/alexkidd.sms \
  --frames 50 \
  --output artifacts/trace_ours.json \
  --verbose
```

### Step 4: Compare Traces

```bash
# Run comparison
npm run trace:compare -- \
  artifacts/trace_ours.json \
  artifacts/mame_traces/alexkidd_mame.json \
  --output artifacts/comparison_report.md \
  --verbose

# View report
cat artifacts/comparison_report.md
```

### Step 5: Analyze Results

The comparison report will show:
- **✓ PERFECT MATCH**: All registers match MAME
- **✗ Divergences Found**: Specific register mismatches with details

## Expected Outcomes

### Best Case ✅
```
✓ PERFECT MATCH
- Match Rate: 100.00%
- Total Entries Compared: 50000
- Divergences: 0
```

### Good Case ✅
```
✗ 1 divergence(s) found
- Match Rate: 99.99%
- Divergence at instruction 12345 in field: SP
- Our Value: 0x1234
- MAME Value: 0x1235
```

### Areas for Investigation ⚠️
```
✗ 10+ divergence(s) found
- Match Rate: < 99%
- Multiple register mismatches
- Likely issues: interrupt handling, specific opcode, edge case
```

## Interpreting Results

### If Traces Match
✅ **Congratulations!** Your emulator's CPU is production-ready for real game code.

### If Divergences Found
⚠️ **Analyze the pattern**:
- Single divergence at specific point? → Targeted fix
- Divergence in interrupt handling? → Phase 2 test issue confirmation
- Consistent register offset? → Systematic issue (e.g., flag calculation)

## File Locations

- **Our trace tool**: `tools/trace_cpu.ts`
- **Comparison tool**: `tools/compare_traces.ts`
- **MAME setup guide**: `docs/MAME_TRACE_SETUP.md`
- **Phase 3 strategy**: `docs/PHASE_3_MAME_TRACE_STRATEGY.md`
- **Output traces**: `artifacts/` (auto-created)
- **Comparison reports**: `artifacts/comparison_report.md`

## npm Scripts

```bash
# Capture trace from emulator
npm run trace:capture -- <rom> [--frames <n>] [--output <file>]

# Compare traces
npm run trace:compare -- <our-trace> <mame-trace> [--output <file>]

# Parse MAME text trace to JSON (if needed)
npm run trace:parse-mame -- <mame-trace.txt> <output.json>

# Generate mock MAME reference (for testing tools)
npm run trace:generate-mock-mame

# Run full Phase 3 validation (all games)
npm run trace:validate:all
```

## Troubleshooting

### "MAME command not found"
```bash
# Install MAME
brew install mame  # macOS
sudo apt-get install mame  # Linux

# Or add to PATH if installed elsewhere
export PATH="$PATH:/path/to/mame"
```

### "ROM not found"
```bash
# Ensure ROMs are in correct location
ls ./roms/
# Should contain: alexkidd.sms, sonic1.sms, etc.
```

### "Trace file format incorrect"
```bash
# Verify MAME version supports trace output
mame -version

# Try generating mock traces instead
npm run trace:generate-mock-mame
```

### "No divergences, but tests still failing"
- This is expected! Traces validate one execution path (linear gameplay)
- Phase 2 tests cover edge cases and complex scenarios
- Both together = comprehensive validation

## Next Steps

### After Phase 3a Completion
1. You have tooling ready
2. Documentation complete
3. Choose reference ROM (mock or real MAME)

### Recommend: Start with Mock Data
```bash
# No MAME needed, tests tools immediately
npm run trace:generate-mock-mame
npm run trace:capture -- ./roms/alexkidd.sms --frames 10
npm run trace:compare -- artifacts/trace_ours.json artifacts/trace_mame.json
```

### Then: Use Real MAME (if available)
```bash
# Follow MAME setup guide
# Capture real reference traces
# Compare against your emulator
```

## Timeline

- **Setup/Tooling**: ✅ Complete
- **MAME Installation**: 5-10 minutes
- **Capture References**: 5-15 minutes per game
- **Run Traces**: < 1 minute
- **Analysis**: 5-30 minutes (depending on divergences)

**Total Estimated Time**: 30-60 minutes for full Phase 3

## Success Criteria

| Criterion | Success |
|-----------|---------|
| Tools runnable | ✅ Yes (trace_cpu.ts, compare_traces.ts both work) |
| Documentation complete | ✅ Yes (MAME_TRACE_SETUP.md, this guide) |
| Traces capture successfully | ✅ When ROM loaded |
| Comparison produces report | ✅ In JSON + markdown format |
| Divergences identified | ✅ If any exist |

## Questions?

Refer to:
1. `docs/PHASE_3_MAME_TRACE_STRATEGY.md` - Full strategy overview
2. `docs/MAME_TRACE_SETUP.md` - MAME-specific setup
3. Tool help: `tsx tools/trace_cpu.ts --help`

---

**Ready to validate your Z80 emulator against MAME?** Start with Step 1 above or generate mock traces for immediate testing.
