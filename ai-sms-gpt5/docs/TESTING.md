# Testing and Determinism

- Runner: Vitest with fast-check for property tests.
- Seed: TEST_SEED env var (default 1337) applied in tests/setup.ts.
- Coverage: v8 provider with thresholds; CI fails if below.
- Goldens: testdata/golden/\* (binary or JSON). UPDATE_GOLDEN=1 allows refreshing locally; CI forbids it.
- External ROMs: Skipped unless env vars point to local files (see EXTERNAL_ROMS.md).

Commands

- npm run lint
- npm run typecheck
- npm run build
- npm test
- npm run test:watch
