# Sega Master System (TypeScript) — Development and Automated Testing Plan

Goal

- Build an accurate SMS emulator core in TypeScript with zero manual testing during development.
- Validation via unit tests, property-based tests, golden-file checks, and optional third-party test ROMs.

Principles

- Test-driven development. Deterministic execution. Pure core; thin adapters.
- Strict TypeScript: no `any`, arrow functions with explicit return types, prefer interfaces.

Architecture (high-level)

- cpu/z80: Full Z80 (prefixes, IX/IY, IM0/1/2, HALT, EI delay, R/I).
- bus: 64KB map, WRAM + mirror, Sega mapper, IO ports (VDP/PSG/controllers/IO control).
- vdp: 16KB VRAM, 32B CRAM, registers, control/data ports, status, line & vblank IRQs, rendering (BG+sprites, 8-per-line limit).
- psg: SN76489 deterministic audio.
- input: controllers and Pause->NMI.
- scheduler: master time in Z80 cycles; tick VDP/PSG; handle IRQ/NMI.
- machine: orchestrates components; frame stepping; serialization; traces.

Testing Strategy

- CPU: per-opcode unit tests, property tests (invariants), golden micro-traces, optional Z80 exercisers.
- Bus/Mapper: unit + property + golden bank window dumps.
- VDP: port protocol, status flags, IRQ timing, sprite limit; golden frames and per-scanline snapshots.
- PSG: register writes, LFSR, attenuation; golden audio buffers and property tests.
- Scheduler: timing conversions, EI delay, IRQ ordering; golden timing traces.
- E2E: run micro ROMs, assert state + video/audio checksums.

External Test ROMs (optional, not bundled)

- Enabled via env vars (see docs/EXTERNAL_ROMS.md). Tests skip if not set.

Milestones

- M0: Bootstrap repo + CI + strict tooling.
- M1: Z80 base ops (loads/ALU) with tests and property checks.
- M2: Full Z80 incl. prefixes and interrupts.
- M3: Bus/RAM/mapper/IO skeleton.
- M4: VDP ports/VRAM/CRAM + interrupts.
- M5: VDP rendering (BG + sprites) with goldens.
- M6: PSG deterministic audio.
- M7: Scheduler integration + E2E harness.
- M8: Optional external ROM harness.

Determinism

- No wall-clock or Math.random in src. Fixed seeds in tests. Fixed-rate audio buffers.

Acceptance Criteria for Frontend Readiness

- CPU opcode coverage with passing unit/property tests.
- Bus mapping validated; IRQ timing approximated.
- VDP register suite + golden images pass.
- PSG audio golden tests pass.
- E2E state/video/audio checksums stable for micro ROMs.
