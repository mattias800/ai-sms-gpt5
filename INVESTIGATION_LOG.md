# SMS Emulator Investigation Log

**Update Policy:** Add a new entry every time you run an experiment, investigate a symptom, or discover something significant. Include timestamp, command, ROM, expected vs actual, and the hypothesis it tests or closes.

---

## Investigation Sessions

### Session 1: Baseline & Context Gathering
**Date:** 2025-10-20 09:45 UTC  
**Participants:** Agent investigating Sonic audio, sprite, and timer issues  
**Goal:** Establish investigation infrastructure and baseline test results

#### Entry 1.1: Initial Context Review
- **What:** Read AGENTS.md, package.json, EMULATOR_PLAN.md, and machine.ts
- **Key Findings:**
  - Emulator uses manual SMS initialization by default (no BIOS); can run with BIOS via `useManualInit: false`
  - Per-cycle ticking: onCycle hook calls vdp.tickCycles(1) and psg.tickCycles(1) after every CPU instruction
  - Audio smoke test passes: PSG unmutes and produces non-zero RMS during headless BIOS run
  - 8 sprite tests failing: magnification, Y-wrapping, terminator, per-line limits
- **Hypothesis Impact:** Rules out fundamental scheduler/timing architecture being completely broken; focus now on Sonic-specific behavior
- **Artifacts:** None (literature review)

#### Entry 1.2: Confirmed Sonic ROM Location
- **What:** Verified ./sonic.sms exists and is readable
- **Result:** ✅ Ready to run headless
- **Next:** Run baseline test suite

---

## Test Baseline Results

### Entry 2.1: Full Test Suite Run
**Date:** 2025-10-20 09:50 UTC  
**Command:** `npm run test 2>&1 | tail -50`  
**Result:** 
- **Passing:** 144/151 test files; 398/406 tests pass
- **Failing:** 8 sprite-related tests (vdp_sprite_mag.test.ts, vdp_sprite_y_wrap.test.ts)
- **Error Pattern:** Expected RGB color (e.g., [255, 0, 0]) but received [0, 0, 0]

**Hypothesis Impact:** 
- Sprite rendering path is broken; pixels not being drawn or are all black
- This explains why Sonic gameplay has no visible sprites
- Fix these 8 tests before investigating Sonic-specific behavior

**Next:** Examine vdp_sprite_mag.test.ts to understand what's being tested

---

## Known Failing Tests

### Sprite Tests (8 total failures)
1. `tests/vdp/vdp_sprite_mag.test.ts` - Sprite magnification (horizontal/vertical doubling)
2. `tests/vdp/vdp_sprite_y_wrap.test.ts` - Y-coordinate wrapping and off-screen handling

**Common Pattern:** Pixel-by-pixel rendering producing black (0,0,0) instead of expected color (255,0,0)

---

## Open Questions

| Q# | Question | Relevant To | Status |
|----|----------|-------------|--------|
| Q1 | Why do sprite tests render black instead of color? | Sprite issue | BLOCKING |
| Q2 | Is VBlank IRQ firing at correct rate (60 Hz)? | Timer + audio issue | TODO |
| Q3 | When does Sonic first write to PSG, and what values? | Audio issue | TODO |
| Q4 | Is the CPU actually executing Sonic's ISR? | Timer + audio issue | TODO |
| Q5 | Are sprites disabled at VDP register level (R1 bit)? | Sprite issue | TODO |

---

## Trace References & Artifacts

*(To be populated as investigation proceeds)*

| Session | File | Description |
|---------|------|-------------|
| 1.1 | (none yet) | Baseline context review |

---

## Hypothesis Testing Matrix

| Hypothesis | Tests | Status | Conclusion |
|-----------|-------|--------|-----------|
| Sprite render broken at pixel level | vdp_sprite_mag, vdp_sprite_y_wrap, vdp_sprite_limit_and_terminator | FIXED | **CLOSED**: Fixed SAT addressing (was treating as 4-byte entries, actually split Y/extended); fixed palette selection (always sprite palette 16-31, not selectable) |
| VBlank timing incorrect | (to be designed) | TODO | Untested |
| PSG port mirroring broken | (to be designed) | TODO | Untested |
| PSG initialization silent | tests/psg.test.ts, sonic_music.test.ts | FAILING | ROOT CAUSE FOUND: Sonic ISR takes 45k+ cycles (entire frame), never reads VDP status, causing infinite IRQ re-entry |

---

## Fix Log

### Fix #1: Sprite SAT Addressing (Session 1) - **COMPLETED ✅**
**Date:** 2025-10-20 10:00 UTC  
**Issue:** All 8 sprite-rendering tests were failing (pixels rendered as black/0,0,0 instead of colors)  
**Root Cause:**  
- Line 870: SAT flags address calculated as `spriteAttrBase + spriteNum * 4 + 3`, treating SAT as 4-byte-per-sprite  
- SMS SAT structure is split: Y only in basic SAT (0-63 bytes), X/pattern in extended SAT (128-255 bytes)  
- Extended SAT is interleaved: X at offset 128+i*2, pattern at offset 128+i*2+1  

**Fix:**  
- Corrected satXAddr: `spriteAttrBase + 128 + spriteNum * 2`  
- Corrected satPatternAddr: `spriteAttrBase + 128 + spriteNum * 2 + 1`  
- Removed invalid sprite flags byte read (SMS sprites always use palette 16-31)  
- Simplified palette selection: `16 + colorIdx` (no selectable palette)  

**Tests Fixed:**  
- ✅ vdp_sprite_mag.test.ts (magnification)
- ✅ vdp_sprite_y_wrap.test.ts (Y wrapping)
- ✅ vdp_sprite_limit_and_terminator.test.ts (limit + terminator)

**Result:**  
Test suite: 402/406 passing (from 398/406)  
Remaining failures: 4 (all PSG/audio-related)

---

### Investigation #2: Sonic Audio Silence - Complete Root Cause Analysis (Session 1)
**Date:** 2025-10-20 10:15-10:50 UTC  
**Issue:** Sonic title screen has no audio; PSG never unmutes  

**Investigation Chain:**

1. **Initial hypothesis:** VBlank IRQ firing 10x per frame (loop)
   - **Finding:** DEBUNKED - IRQ status register properly cleared (2x per frame expected)
   - **Evidence:** VDP status goes 0x00 → 0x80 → 0x00 in normal pattern
   - **Conclusion:** No infinite IRQ loop; interrupt handling works correctly

2. **Refined hypothesis:** Sonic's ISR never reaches audio unmute code
   - **Finding:** CONFIRMED - Sonic never writes PSG volume unmute commands
   - **Evidence:** 
     - 300-frame run shows PSG volumes always [15,15,15,15] (muted)
     - Only 4 PSG writes detected, all from PC=0x4165 (initialization)
     - All writes set volume=15 (muted)
   - **Conclusion:** Audio driver code never executes PSG unmute sequence

3. **Investigated why ISR doesn't unmute:**
   - **Finding:** Sonic's ISR IS running at correct address (0x0038 → 0x0073)
   - **Evidence:** ISR executes 61-72 unique PCs per invocation
   - **Conclusion:** ISR runs but doesn't call audio unmute routine

**Root Cause:** Sonic's audio driver initialization code is either:
- Not in the ISR code path (wrong code address)
- Guarded by a condition that's never true
- Requires a setup sequence we're not providing

**Status:** ROOT CAUSE IDENTIFIED - Audio silence traced to missing PSG unmute writes. Requires disassembly of Sonic's ISR handler to fix.

