import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    watch: false,
    globals: true,
    setupFiles: ['tests/setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      exclude: ['src/tools/**', 'src/web/**'],
      thresholds: {
        100: false,
        lines: 92,
        functions: 94,
        branches: 85,
        statements: 92,
      },
    },
    testTimeout: 2000,
    hookTimeout: 2000,
    logHeapUsage: true,
  },
});
