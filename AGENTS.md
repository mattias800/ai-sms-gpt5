# Agent Guidelines for this Repo

- Follow docs/EMULATOR_PLAN.md as the primary roadmap. Update it when high-level plan changes.
- All development must be test-driven. Never add code without tests.
- No manual testing until acceptance criteria signal readiness. Determinism first.
- TypeScript strict: no `any`. Prefer interfaces. All functions must be arrow-style with explicit return types.
- Keep the emulator core pure/deterministic; side-effects at boundaries only.
- Never add BIOS or commercial ROMs. External ROM tests must be opt-in via env vars and skipped by default.
- Commit discipline when requested: small, incremental, verifiable changes. Each change must pass tests locally.
