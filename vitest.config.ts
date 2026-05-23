import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Unit-test config (no emulator). R190-2.
 *
 * Scope: tests/unit/** only. Firestore rules tests live in
 * tests/firestore-rules.test.ts and require the Firestore emulator — they are
 * run separately via `pnpm test:rules` (firebase emulators:exec ...) and are
 * EXCLUDED here so `pnpm test:unit` stays fast and dependency-free.
 *
 * `@/` alias mirrors tsconfig.json paths ("@/*" -> ./src/*) declared inline to
 * avoid adding vite-tsconfig-paths as a dependency.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      'server-only': resolve(__dirname, './tests/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/firestore-rules.test.ts', 'node_modules/**'],
    environment: 'node',
  },
});
