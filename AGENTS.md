# Agent Guidelines for this Repo

- Follow docs/EMULATOR_PLAN.md as the primary roadmap. Update it when high-level plan changes.
- All development must be test-driven. Never add code without tests.
- No manual testing until acceptance criteria signal readiness. Determinism first.
- TypeScript strict: no `any`. Prefer interfaces. All functions must be arrow-style with explicit return types.
- Keep the emulator core pure/deterministic; side-effects at boundaries only.
- Never add BIOS or commercial ROMs. External ROM tests must be opt-in via env vars and skipped by default.
- Commit discipline when requested: small, incremental, verifiable changes. Each change must pass tests locally.
- All Node debug/analysis scripts live in scripts/ and are executed with tsx.
- tsc does not emit; do not rely on dist for tools/tests. Run TypeScript files directly via tsx.

## SMS BIOS usage (ALWAYS use this when a BIOS is required)

When running SMS with a BIOS (including headless Wonder Boy checks), ALWAYS use this BIOS:

- Path (relative to repo root): `./third_party/mame/roms/sms1/mpr-10052.rom`

Preferred usage:
- Set the environment variable `SMS_BIOS` to the path above for any run that uses a BIOS.
  Example:
  `SMS_BIOS=./third_party/mame/roms/sms1/mpr-10052.rom <your command>`

Notes:
- Tools may auto-detect this exact path when `SMS_BIOS` is not set. If both are present, `SMS_BIOS` takes precedence.
- Do not substitute other BIOS revisions unless explicitly requested for comparison.
- Our acceptance for Wonder Boy visuals (blue background + SEGA logo ~120 frames) assumes this BIOS.
