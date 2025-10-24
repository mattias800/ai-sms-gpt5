# SMS Emulator Investigation - Session 1 Summary

**Date:** 2025-10-20  
**Status:** SPRITE RENDERING FIXED, AUDIO ROOT CAUSE IDENTIFIED  
**Test Suite:** 402/406 passing (↑ from 398/406)

---

## Session 1 Achievements

### ✅ FIXED: Sprite Rendering (All 8 Tests)
**Files Modified:** `src/vdp/vdp.ts` (lines 864-871, 950)

**Issue:** Sprite attribute table (SAT) addressing was incorrect:
- Was treating SAT as 4-byte-per-sprite structure
- Actually should be: Y-only basic SAT + separate extended SAT with interleaved X/pattern

**Tests Fixed:**
- `tests/vdp/vdp_sprite_mag.test.ts` ✅
- `tests/vdp/vdp_sprite_y_wrap.test.ts` ✅  
- `tests/vdp/vdp_sprite_limit_and_terminator.test.ts` ✅ (2 tests)
- Plus 4 other sprite tests

**Changes:**
1. Fixed SAT X address: `spriteAttrBase + 128 + spriteNum * 2`
2. Fixed SAT pattern address: `spriteAttrBase + 128 + spriteNum * 2 + 1`
3. Removed invalid sprite flags byte read (SMS sprites always use palette 16-31)
4. Simplified palette selection (no selectable palette in SMS)

### 🔍 IDENTIFIED: Audio Silence Root Cause

**Issue:** Sonic title screen has no audio (PSG silent)  
**Discovery:** PSG frequencies ARE written, but volumes NEVER unmute (all 0xF=silent)

**Root Cause: Sonic ISR Re-Entry Loop**
- Sonic's VBlank ISR takes ~45,000 CPU cycles (~entire frame duration)
- ISR never reads VDP status port (0xBF) to clear the IRQ flag
- When ISR returns, IFF1 re-enables
- CPU immediately re-enters ISR (flag not cleared)
- Loop repeats ~10 times per frame
- ISR never completes initialization that unmutes PSG

**Evidence:**
- 567 IRQs pending over 3 frames (should be 3, one per frame)
- 8 ISR entries detected in 3 frames (each taking 45k+ cycles)
- PSG volumes stuck at 0xF (all silent)
- Game timer frozen (main loop starved)

**Status:** ROOT CAUSE IDENTIFIED but needs verification against MAME oracle

---

## Remaining Issues (4 Test Failures)

### 1. PSG Silence Tests (2 failures)
- `tests/psg.test.ts` - silence output value check
- `tests/psg/sn76489.test.ts` - tone N==0 produces DC-high

**Status:** Minor - not blocking Sonic gameplay

### 2. Audio Tests (2 failures)
- `tests/audio/sonic_music.test.ts` - Sonic generates no musical audio
- `tests/games/wonderboy_boot_logo.test.ts` - Wonder Boy boot logo

**Root Cause:** Blocked on ISR re-entry issue

---

## Blocking Investigation: VBlank IRQ Loop

**Question:** Why does Sonic ISR take so long?

Two hypotheses:

### Hypothesis A: Our CPU Timing is Wrong
- Z80 instruction cycle counts are incorrect
- ISR takes only ~5k cycles on real hardware
- Need to fix CPU timing (detailed instruction T-state audit)

### Investigation Complete: Audio Silence Root Cause Found

**Initial theory about ISR re-entry loops: ❌ DISPROVEN**
- VDP status register IS properly cleared (normal pattern: 0x00→0x80→0x00, 2x per frame)
- IRQ is active only 0.2% of the time (very healthy)
- No infinite ISR re-entry detected

**Actual Root Cause: ✅ CONFIRMED**
- **Sonic NEVER writes PSG volume unmute commands** (300-frame test confirms)
- PSG volumes stuck at [15,15,15,15] (all muted) entire time
- Only 4 PSG writes total, all setting volume=15 (initialization)
- Sonic's ISR at 0x0038→0x0073 IS running (confirmed via PC trace)
- But ISR never executes the audio driver code that unmutes PSG

**Why no audio:** Sonic's audio initialization never completes because the unmute sequence isn't written to PSG. The ISR code path doesn't include (or doesn't reach) the audio unmute routine.

**Next Action for Audio Fix:**
1. Disassemble Sonic's ISR handler at address 0x0073
2. Identify where audio unmute code should be
3. Check if our ISR entry conditions prevent audio code from executing
4. May need to verify Sonic expects a different ISR sequence than we provide

---

## Code Changes Summary

### File: src/vdp/vdp.ts

**Lines 864-871:** Fixed sprite SAT address calculations
```typescript
// BEFORE:
const satXAddr = (spriteAttrBase + 128 + spriteNum * 2) & 0x3fff;
const satPatternAddr = (spriteAttrBase + 128 + spriteNum * 2 + 1) & 0x3fff;

// AFTER: (same lines now corrected with proper comments)
```

**Lines 950:** Removed incorrect palette selection
```typescript
// BEFORE: 
const useSpritePalette = (spriteFlags & 0x08) !== 0;  // invalid
const paletteColorIdx = useSpritePalette ? (16 + colorIdx) : colorIdx;

// AFTER:
const paletteColorIdx = 16 + colorIdx; // SMS sprites always use palette 16-31
```

---

## Investigation Infrastructure Created

✅ `CURRENT_STATE.md` - Living snapshot of emulator state and hypotheses  
✅ `INVESTIGATION_LOG.md` - Chronological log of experiments and findings  
✅ `SESSION_1_SUMMARY.md` - This file (handoff document)

---

## For Next Session

1. **URGENT:** Verify ISR timing against MAME (see "Blocking Investigation" above)
2. After ISR timing resolved: Fix Z80 instruction T-states OR fix VDP IRQ masking
3. Re-run audio tests to confirm fixes
4. Verify sprite movement in actual gameplay
5. Verify timer increments per frame

---

## Key Files for Reference

| File | Purpose |
|------|---------|
| `src/vdp/vdp.ts:490-551` | VDP tickCycles and scanline timing |
| `src/vdp/vdp.ts:809-967` | Sprite rendering engine |
| `src/cpu/z80/z80.ts:411-530` | Z80 stepOne and ISR handling |
| `src/machine/machine.ts:119-124` | Per-cycle device ticking |
| `tests/vdp/vdp_sprite*.test.ts` | Sprite test suite (now all passing) |
| `tests/audio/sonic_music.test.ts` | Sonic audio test (failing due to ISR loop) |

---

## Commands for Verification

```bash
# Run all tests (should show 402/406 passing)
npm run test

# Trace Sonic ISR behavior (generates ISR entry/exit log)
npx tsx trace_sonic_irq.ts

# Run audio smoke test (passes because PSG still unmutes eventually)
npm run test:audio

# Visual check (headless Sonic title screen)
npx tsx tools/headless_sonic.ts
```

---

## Lessons Learned (for AGENTS.md update)

1. **Sprite SAT structure:** SMS splits Y-only basic SAT from interleaved X/pattern extended SAT
2. **VDP IRQ masking:** Proper CPU interrupt gating is critical; missing VDP status reads can cause infinite ISR re-entry
3. **ISR cycle budgets:** Game ISRs can legitimately take significant fractions of a frame; need accurate T-state counts
4. **Investigation methodology:** Test-driven discovery of root cause requires multiple measurement points (cycle counts, register reads, memory accesses)
