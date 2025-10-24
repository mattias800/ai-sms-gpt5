# ZEXDOC Z80 CPU Validation Guide

## What is ZEXDOC?

ZEXDOC is a comprehensive Z80 instruction validation test ROM that exercises all documented Z80 opcodes. It's the industry-standard tool for validating Z80 CPU emulator implementations.

**Source**: https://github.com/anotherlin/z80emu (look for `zexdoc.com` or `zexdoc.bin`)

## Quick Start

### Step 1: Obtain ZEXDOC ROM

```bash
# Option 1: Download from z80emu project
git clone https://github.com/anotherlin/z80emu.git /tmp/z80emu
find /tmp/z80emu -name "zexdoc.*" -o -name "*zex*"

# Option 2: Look in your MAME ROMs
find ~/MAME/roms -name "*zex*"

# Once found, place it here:
mkdir -p third_party/test-roms/zexdoc/
cp /path/to/zexdoc.com third_party/test-roms/zexdoc/zexdoc.com
```

### Step 2: Run Our Emulator Against ZEXDOC

```bash
npm run test:z80:zexdoc
```

This will:
1. Load the ZEXDOC ROM
2. Run it in our Z80 emulator
3. Capture final CPU state and memory
4. Save results to `artifacts/zexdoc_results.json`

### Step 3: Generate MAME Reference Data

```bash
# Run ZEXDOC in MAME and capture its output
mame sms -cart /path/to/zexdoc.com -window -resolution 320x224

# Manually collect the results and create reference JSON
# Or use our trace extraction script (coming soon)
```

Create `artifacts/zexdoc_reference.json` with this format:

```json
{
  "success": true,
  "registers": {
    "pc": 0x0000,
    "sp": 0xffff,
    "a": 0x00,
    "f": 0x00,
    "b": 0x00,
    "c": 0x00,
    "d": 0x00,
    "e": 0x00,
    "h": 0x00,
    "l": 0x00,
    "ix": 0x0000,
    "iy": 0x0000,
    "i": 0x00,
    "r": 0x00
  },
  "cycles": 12345678,
  "timestamp": "2025-10-22T12:00:00Z"
}
```

### Step 4: Compare Results

```bash
npm run test:z80:compare
```

This will:
1. Load both our results and MAME reference
2. Compare all critical registers
3. Check cycle count
4. Generate a detailed report: `artifacts/zexdoc_comparison.json`
5. Exit with code 0 if perfect match, 1 if divergence

### Full Validation

```bash
# Run both steps at once
npm run test:z80:validate
```

## Manual MAME Reference Extraction (Detailed)

If you have MAME installed, here's how to capture ZEXDOC output:

```bash
# 1. Start MAME with ZEXDOC
ZEXDOC=/path/to/zexdoc.com
mame sms -cart "$ZEXDOC" -window -resolution 320x224 -nothrottle

# 2. Let it run until it halts or shows final state

# 3. Read the SMS screen output to determine final state
#    ZEXDOC displays test results on screen

# 4. Manually create reference JSON based on what MAME shows
```

## Alternative: Using MAME Trace

If you have scripting capabilities, create a trace:

```bash
# Use MAME debugger to capture execution trace
# Save final state when CPU reaches HALT instruction

# Then run our comparison tool
npm run test:z80:compare
```

## Understanding the Comparison Report

The comparison report (`artifacts/zexdoc_comparison.json`) will show:

```json
{
  "match": true,
  "summary": "✓ PERFECT MATCH - All registers and cycles match MAME",
  "differences": {},
  "timestamp": "2025-10-22T12:00:00Z"
}
```

Or if there are issues:

```json
{
  "match": false,
  "summary": "✗ DIVERGENCE - 2 differences found",
  "differences": {
    "reg_pc": {
      "ours": 12345,
      "reference": 12347
    },
    "cycles": {
      "ours": 99999,
      "reference": 100000
    }
  }
}
```

## What Each Comparison Tells You

| Issue | Meaning | Likely Cause |
|-------|---------|--------------|
| PC mismatch | Control flow diverged | Incorrect branch/jump/interrupt handling |
| Register mismatch | Data corrupted | Bug in ALU or register operations |
| Cycle count mismatch | Timing incorrect | Wrong cycle counts or missing stalls |
| A/F mismatch | Accumulator/flags wrong | ALU implementation bug |

## Troubleshooting

### "ZEXDOC ROM not found"

```bash
# Set environment variable to point to ROM
ZEXDOC_PATH=/path/to/zexdoc.com npm run test:z80:zexdoc
```

### "Reference data not found"

```bash
# You need to generate reference data
# Follow "Generate MAME Reference Data" section above
```

### "Perfect match but tests still fail"

If ZEXDOC passes but games don't work:
- ZEXDOC tests documented opcodes
- Check our edge case tests (Phase 2)
- May need undocumented opcode behavior

### Program runs forever

ZEXDOC should halt quickly (< 30 seconds). If it doesn't:
1. Check if ROM loaded correctly
2. May indicate infinite loop in emulator
3. Review CPU state during execution

## Next Steps

1. **Once ZEXDOC passes**: Move to Phase 2 (comprehensive edge case tests)
2. **Trace validation**: Compare against MAME for known games
3. **Regression testing**: Add ZEXDOC to CI/CD pipeline

## Success Criteria

✅ ZEXDOC runs to completion
✅ Final PC at expected value
✅ All registers match MAME
✅ Cycle count within 1% of reference
✅ Can claim "Z80 CPU validated against ZEXDOC"

## Files Generated

- `artifacts/zexdoc_results.json` - Our execution results
- `artifacts/zexdoc_reference.json` - MAME reference data (you create)
- `artifacts/zexdoc_comparison.json` - Comparison report

## Environment Variables

- `ZEXDOC_PATH` - Override default search paths for ZEXDOC ROM
- `ZEXDOC_MAME_REFERENCE` - Override reference data location
- `ZEXDOC_MAX_CYCLES` - Max cycles before timeout (default: 100M)
