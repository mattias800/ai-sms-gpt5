# Phase 5: Graphics, Audio, and Full Hardware Validation

**Status**: STARTING  
**Date**: October 22, 2025  
**Objectives**: Validate VDP (graphics), PSG (audio), full hardware integration, and establish MAME-based comparison framework

## Phase 5 Overview

Phase 4 successfully validated CPU execution on 3 real games. Phase 5 extends validation to the complete SMS hardware stack:

1. **Graphics (VDP)** - Pixel-level frame validation
2. **Audio (PSG)** - Audio waveform validation
3. **Full Hardware** - Complete system integration tests
4. **MAME Comparison** - CPU, VDP, PSG trace comparison against reference emulator

## Detailed Objectives

### 1. MAME Trace Comparison Framework (CPU Layer)

**Goal**: Compare CPU execution traces against MAME to identify any instruction-level bugs.

**Implementation**:
- [ ] Check `artifacts/mame_traces/` for existing MAME reference traces
- [ ] If missing, download or document how to generate MAME traces
- [ ] Build trace comparison tool that:
  - Loads our captured traces and MAME traces
  - Compares instruction-by-instruction
  - Reports divergences with context (PC, registers, memory state)
  - Identifies first divergence point for debugging
- [ ] Run comparisons on all 3 games (Wonder Boy, Alex Kidd, Sonic 1)
- [ ] Generate divergence report with severity classification
- [ ] Fix any CPU bugs found

**Success Criteria**:
- ✅ All game traces match MAME within expected tolerance
- ✅ Zero unexecpected instruction divergences
- ✅ If divergences exist, root causes identified and documented

### 2. VDP (Graphics) Validation

**Goal**: Validate graphics rendering against known-good output.

**Implementation**:
- [ ] Extend trace system to capture VDP state:
  - VRAM contents at frame boundaries
  - CRAM (color RAM) state
  - VDP register state
  - Sprite table snapshots
  - Scanline-by-scanline timing
- [ ] Build VDP frame comparison tool:
  - Render our VDP output to PNG/raw frames
  - Compare against MAME reference frames
  - Report pixel differences if any
- [ ] Create golden frame checksums for test ROMs
- [ ] Run graphics validation on:
  - BIOS boot sequence (Wonder Boy intro)
  - Test ROM with known patterns
  - Each real game (Wonder Boy, Alex Kidd, Sonic 1)
- [ ] Fix any graphics bugs found

**Success Criteria**:
- ✅ VDP state traces complete and consistent
- ✅ Frame generation bit-accurate with reference
- ✅ Golden checksums stable across runs
- ✅ Sprite rendering and collision detection correct

### 3. PSG (Audio) Validation

**Goal**: Validate audio generation against known-good reference.

**Implementation**:
- [ ] Extend trace system to capture PSG state:
  - All 4 channel register writes (tone, attenuation)
  - LFSR state for noise channel
  - Envelope/volume updates
  - Output PCM samples
- [ ] Build PSG validation tool:
  - Render our PSG output to WAV format
  - Compare against MAME reference audio
  - Audio fingerprinting/frequency analysis
  - Waveform correlation
- [ ] Create test vectors:
  - BIOS jingle (reference tone sequence)
  - Test ROM audio patterns
  - Real game audio (Wonder Boy, Alex Kidd, Sonic 1)
- [ ] Fix any audio bugs found

**Success Criteria**:
- ✅ PSG state traces accurate and deterministic
- ✅ Generated WAV matches reference audio format
- ✅ Frequency content matches known good
- ✅ Timing of audio events synchronized

### 4. Full Hardware Integration

**Goal**: Validate complete system behavior with all components working together.

**Implementation**:
- [ ] Integration tests covering:
  - CPU+VDP interrupt coordination
  - CPU+PSG timing and register writes
  - Controller input handling
  - Memory banking and ROM switching
  - BIOS and cartridge coexistence
  - NMI (Pause button) handling
- [ ] E2E test scenarios:
  - Boot sequence with BIOS
  - Title screen rendering
  - User input response
  - Audio during gameplay
  - Multiple frame sequences
- [ ] Stress testing:
  - 1000-frame runs of each game
  - Memory leak detection
  - State consistency verification
  - Determinism across reruns

**Success Criteria**:
- ✅ All 3 games run stably for 1000+ frames
- ✅ No memory leaks or corruption
- ✅ Consistent deterministic behavior
- ✅ All I/O subsystems functional

### 5. Performance Optimization

**Goal**: Ensure emulator executes at reasonable speed on target platform.

**Implementation**:
- [ ] Profile execution on each game:
  - Instruction throughput
  - Memory access patterns
  - CPU vs I/O wait time
  - VDP/PSG processing overhead
- [ ] Identify bottlenecks:
  - Hot loops
  - Inefficient algorithms
  - Memory layout issues
- [ ] Implement optimizations:
  - Instruction dispatch optimization
  - Cache-friendly data structures
  - Lazy evaluation where safe
- [ ] Benchmark before/after:
  - FPS (frames per second)
  - CPU utilization
  - Memory usage

**Success Criteria**:
- ✅ 60 FPS or better on modern hardware
- ✅ CPU utilization < 50% on single core
- ✅ Memory usage < 100 MB
- ✅ Determinism maintained after optimization

## Implementation Strategy

### Phase 5a: MAME Comparison (Days 1-2)
1. Investigate available MAME traces
2. Build comparison tool
3. Run initial comparisons
4. Fix any CPU divergences found

### Phase 5b: VDP Validation (Days 2-3)
1. Extend trace system for VDP state
2. Build frame comparison tool
3. Create golden checksums
4. Run graphics validation

### Phase 5c: PSG Validation (Days 3-4)
1. Extend trace system for PSG state
2. Build audio comparison tool
3. Generate and validate WAV files
4. Run audio validation

### Phase 5d: Full System Testing (Day 4)
1. Create integration tests
2. Run stress tests on all games
3. Performance profiling and optimization
4. Final validation

### Phase 5e: Documentation (Day 5)
1. Document all findings
2. Create Phase 5 completion report
3. Assess readiness for Phase 6

## Trace Comparison Architecture

### CPU Trace Comparison Tool

```
Input:
  - Our trace: artifacts/wonderboy_trace.json
  - MAME trace: artifacts/mame_traces/wonderboy_mame.json

Processing:
  1. Load both traces into memory
  2. Iterate frame-by-frame
  3. For each instruction:
     - Compare PC, opcode, register state
     - Compare memory state (if tracing)
     - Track first divergence
  4. Generate divergence report

Output:
  - divergence_analysis.json: {
      game: string,
      total_frames: number,
      total_instructions: number,
      first_divergence_frame: number,
      first_divergence_instruction: number,
      divergence_details: {
        pc_ours: number,
        pc_mame: number,
        opcode_ours: string,
        opcode_mame: string,
        registers_ours: {},
        registers_mame: {}
      },
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "NONE"
    }
```

### VDP Trace Format

```
vdp_traces: {
  frames: [
    {
      frame_number: number,
      vram_checksum: string,  // SHA256 of VRAM contents
      cram_checksum: string,  // SHA256 of CRAM contents
      registers: [0x00..0x0F],
      line_irq_triggered: boolean,
      vblank_irq_triggered: boolean,
      sprite_count: number,
      bg_scroll_x: number,
      bg_scroll_y: number
    }
  ]
}
```

### PSG Trace Format

```
psg_traces: {
  writes: [
    {
      frame: number,
      instruction_count: number,
      register: number,  // 0-3 for channels
      value: number,
      timestamp_cycles: number
    }
  ],
  lfsr_snapshots: [
    {
      frame: number,
      lfsr_state: number
    }
  ],
  pcm_samples: number[]  // Complete audio stream
}
```

## Risk Assessment

### Known Risks
1. **MAME Traces Unavailable**: May need to generate using MAME or find reference
2. **Graphics Rendering**: VDP might have subtle bugs not caught by CPU tracing
3. **Audio Timing**: PSG timing might be sensitive to exact cycle counts
4. **Performance**: Unoptimized traces might run slowly
5. **Determinism**: Non-deterministic bugs might appear under heavy load

### Mitigation
- Test-driven approach catches regressions early
- Multiple games provide diverse test coverage
- Automated validation prevents manual errors
- Reference traces ensure correctness

## Success Metrics for Phase 5

| Metric | Target | Status |
|--------|--------|--------|
| CPU traces vs MAME match | 100% | PENDING |
| VDP frames render correctly | 100% | PENDING |
| Audio WAV generation works | YES | PENDING |
| All 3 games stable 1000+ frames | YES | PENDING |
| Performance > 60 FPS | YES | PENDING |
| Zero crashes during validation | YES | PENDING |
| Full documentation complete | YES | PENDING |

## Deliverables

- [ ] MAME Trace Comparison Tool (scripts/mame_trace_compare.ts)
- [ ] VDP Trace Capture Extension (src/debug/vdp_trace.ts)
- [ ] PSG Trace Capture Extension (src/debug/psg_trace.ts)
- [ ] Frame Comparison Tool (scripts/compare_frames.ts)
- [ ] Audio Validation Tool (scripts/validate_audio.ts)
- [ ] Integration Test Suite (tests/integration/)
- [ ] Performance Profile Report (PHASE_5_PERFORMANCE.md)
- [ ] Divergence Analysis Report (PHASE_5_DIVERGENCE.md)
- [ ] Phase 5 Completion Report (PHASE_5_COMPLETE.md)

## Timeline

- **Start**: October 22, 2025 11:16 UTC
- **MAME Comparison**: 2-3 hours
- **VDP Validation**: 3-4 hours
- **PSG Validation**: 3-4 hours
- **Full System Testing**: 2-3 hours
- **Optimization**: 2-3 hours
- **Documentation**: 1-2 hours
- **Total Estimate**: 16-22 hours

## Next Steps

1. ✅ Create Phase 5 plan (THIS DOCUMENT)
2. ⏳ Investigate MAME trace availability
3. ⏳ Build CPU trace comparison tool
4. ⏳ Run MAME comparisons
5. ⏳ Implement VDP and PSG trace capture
6. ⏳ Create graphics and audio validation
7. ⏳ Run full system integration tests
8. ⏳ Document Phase 5 results

---

**Phase 5 Ready to Begin ✅**
