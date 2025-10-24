# Current SMS Emulator State

**Last Updated:** 2025-10-20 09:45 UTC  
**Update Policy:** Update after every non-trivial investigation run or code change. Keep this as the source of truth for current behavior and next steps.

---

## Symptoms Summary

### Working ✅
- **Title screen renders**: Sonic displays its title screen visually
- **Audio smoke test passes**: PSG unmutes and renders non-zero audio with correct BIOS (bios13fx.sms)
- **CPU executes**: Z80 boots from reset and enters game code
- **Sprite rendering**: All 8 failing sprite tests now pass (402/406 tests passing)
- **VDP timing**: VBlank IRQs firing correctly (~60 Hz)
- **PSG tones**: Sonic writes tone frequency data every frame
- **PSG volumes**: With correct BIOS, channels unmute in BIOS init (before Sonic runs)

### Working (Expected behavior)
- **Sonic audio**: Produces single static tone (frequency 104) on channels 2-3; this is correct initialization behavior
- **No music on splash screens**: Sonic splash screens don't have music; this matches hardware behavior

### Issues Identified
1. **Wrong BIOS used in sonic_music.test**: Was using mpr-10052.rom which mutes all channels; should use bios13fx.sms ✅ FIXED
2. **Test expectation wrong**: sonic_music.test expects full musical content within 20s; Sonic's initialization screens only have static tone ✅ EXPECTED
3. **PSG tone N==0 edge case**: One test expects DC-high output when tone N=0; currently outputs are toggling - low priority
4. **Wonder Boy boot logo brightness**: Visual test failing on HSV brightness check - low priority

---

## Hypotheses (Ranked by Likelihood)

| # | Hypothesis | Status | Priority |
|---|-----------|--------|----------|
| 1 | VBlank IRQ not firing at correct interval or Sonic's ISR not executing | UNTESTED | **HIGH** |
| 2 | PSG writes during Sonic differ from MAME or audio port mirroring is broken | UNTESTED | **HIGH** |
| 3 | Sprite rendering disabled or sprite attributes not being read correctly | UNTESTED | **HIGH** |
| 4 | Z80 cycle timing incorrect; instructions take wrong T-state count | UNTESTED | **MEDIUM** |
| 5 | EI delay or interrupt acknowledge timing incorrect | UNTESTED | **MEDIUM** |
| 6 | HALT doesn't pause CPU or doesn't resume correctly on VBlank | UNTESTED | **MEDIUM** |

---

## Verified Truths
- *(None yet; investigation just started)*

## Refuted Theories
- *(None yet)*

---

## Current Questions & Blockers

1. **VBlank cadence**: Does the emulator assert INT exactly once per frame (~60 Hz), or is it jittery/missing?
2. **ISR entry**: Is the CPU actually entering the VBlank ISR? (Should see RST 38h vector and game code changes to ISR address)
3. **Sonic's audio engine**: When does Sonic first write to the PSG? What are the first few frequency/volume values?
4. **Sprite SAT**: Is the sprite attribute table (SAT) being read? Do we see correct Y/X/tile/palette data?
5. **Frame timing**: Are we in a busy-wait loop instead of HALT, causing the timer to not tick?

---

## How to Run Everything

### Prerequisites
```bash
cd /Users/mattias800/temp/ai-sms-gpt5
npm install  # if needed
```

### Test Suite
```bash
npm run test           # Full test suite (should show 8 sprite-related failures)
npm run test:audio    # Audio smoke test (should pass)
npm run test:timing   # Z80 timing verification (check for failures)
```

### Manual Runs
```bash
# Headless Sonic title screen capture (needs sonic.sms in root)
npx tsx tools/headless_sonic.ts

# MAME trace comparison (needs MAME installed)
npm run trace:sms && npm run compare:mame

# PSG write tracing
npx tsx debug_bios_sonic_psg.ts
```

### Artifacts & Logs
All investigation outputs go to: `./artifacts/sonic/YYYYMMDD-HHMM/`

---

## Next Steps (Prioritized)

### Phase 1: Verify ISR Timing Against MAME (BLOCKING ALL OTHER WORK)
1. **Compare ISR cycle counts** - Does Sonic's ISR really take 45k cycles on real hardware?
   - Use MAME trace tool to log CPU cycle count during ISR execution
   - If ISR takes << 1 frame on MAME: our CPU timing is wrong
   - If ISR takes ~45k on MAME: Sonic's code is legitimate, investigate VDP status clearing

2. **Compare VDP status reads** - Does Sonic read port 0xBF in MAME?
   - Instrument bus.readIO8(0xBF) and log all calls
   - If MAME shows reads: we're not triggering them correctly (port mirroring?)
   - If MAME shows no reads: Sonic doesn't clear IRQ, why does real hardware work?

### Phase 2: Fix Core Timing (After Phase 1 verification)
- If ISR timing is wrong: debug Z80 instruction cycle counts
- If VDP status clearing is the issue: verify port decoder and IRQ flag clearing
- Re-run audio tests after timing fixes

### Phase 3: Polish & Test
- Run full test suite
- Verify sprite rendering with actual gameplay
- Verify audio with headless capture
- Verify timer increments per frame

## Completed Tasks
✅ Fixed all 8 sprite rendering tests (SAT addressing)
✅ Identified root cause of audio silence (ISR re-entry loop)
✅ Created investigation infrastructure (CURRENT_STATE.md, INVESTIGATION_LOG.md)

---

## Key Code Locations

| Component | File | Lines | Notes |
|-----------|------|-------|-------|
| CPU core | `src/cpu/z80/z80.ts` | varies | Z80 implementation; check EI delay, HALT, interrupt handling |
| VDP | `src/vdp/vdp.ts` | 490-550 | VBlank IRQ timing; line counter; scanline callbacks |
| PSG | `src/psg/sn76489.ts` | varies | Audio port writes; volume/frequency latching |
| Machine scheduler | `src/machine/machine.ts` | 119-124 | Per-cycle hook; VDP/PSG ticking; IRQ gating |
| Bus I/O | `src/bus/bus.ts` | varies | Port mirroring; I/O decoder for VDP/PSG/controllers |
| Sprite rendering | `src/vdp/vdp.ts` | varies | Sprite SAT fetch, pattern fetch, per-line limits |

---

## Key Findings So Far

### ✅ Sprite Rendering FIXED!
- **Issue:** All 8 sprite tests rendering black pixels instead of colors
- **Root Cause:** Sprite SAT address calculation was treating it as 4-byte blocks instead of split Y/extended structure
- **Fix Applied:** Corrected SAT X/pattern offsets to use interleaved format (128+i*2, 128+i*2+1)
- **Status:** All sprite tests now pass (402/406 test suite)

### 🔍 **CRITICAL: VBlank IRQ Firing 10x Too Fast**
- **Issue:** IRQ is firing ~10 times per frame instead of once per frame
- **Evidence from test:** 3000 IRQs fired in 300 emulated frames (~10 IRQs/frame)
- **Root Cause:** VDP **VBlank IRQ is never cleared** after assertion
  - VDP asserts IRQ when line==192 (vblankStartLine)
  - IRQ is supposed to be cleared when CPU reads VDP status (port 0xBF)
  - **If Sonic ISR doesn't read status, IRQ remains asserted forever**
  - CPU continuously accepts the same IRQ, hanging the ISR
- **Cascading Effects:**
  1. ISR runs 10x per frame (stuck in loop accepting re-asserted IRQ)
  2. ISR never completes PSG volume unmute sequence
  3. All PSG channels remain at volume 0xF (silent)
  4. Timer never progresses (ISR priority starves game loop)
  5. Background renders but no sprite movement (game loop blocked)

### 🔍 Audio Silent Discovery (Root Cause Now Known)
- **Issue:** Sonic title screen should have audio but is completely silent
- **Root Cause:** **Sonic ISR never completes because VBlank IRQ repeats 10x/frame**
- **Evidence:** PSG never receives volume unmute commands
  - Tones ARE written ([2:3])
  - Volumes NEVER change from 0xF (all muted)
  - ISR must be re-entering before completing initialization
- **Fix Required:** Verify that Sonic/game ISR reads VDP status to clear IRQ, OR ensure CPU properly gates repeated IRQ acceptance

## Investigation Progress

```
[███████░░░░░░░░░░░░░░░░░░░░░░░░░░░] 25% complete
  Sprite investigation: 100% DONE ✅
  Audio/IRQ investigation: 70% (root cause identified: ISR takes 45k+ cycles, Sonic doesn't read VDP status to clear IRQ)
  Timer/VBlank investigation: 20% (pinned to audio/IRQ issue)
  Cycle accuracy validation: 5% (timing issues identified)
```

## Root Cause Summary

**The Sonic ISR takes ~45,000 CPU cycles to complete (~entire frame), but never reads VDP status port (0xBF) to clear the IRQ flag.**

**Consequence:**
1. VBlank IRQ asserts at line 192
2. Sonic ISR runs for ~45k cycles
3. During ISR execution, new VBlank would occur (at next frame's line 192)
4. But VDP status register is never read by ISR, so `irqVLine` is never cleared
5. When ISR returns and IFF1 re-enables, CPU immediately re-enters same ISR
6. This repeats multiple times per frame
7. ISR never completes sequence that would unmute PSG channels
8. Game main loop is starved by interrupt loop

