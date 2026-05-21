import { defineConfig } from 'vitest/config';

/**
 * Firestore rules-test config (R190-3). Isolated from the default unit config
 * (vitest.config.ts) so the two flows never filter each other out.
 *
 * Invoked only by `pnpm test:rules`, which wraps this in
 * `firebase emulators:exec`. Includes ONLY the rules spec; no @/ alias because
 * the rules test imports nothing from src/.
 */
export default defineConfig({
  test: {
    include: ['tests/firestore-rules.test.ts'],
    environment: 'node',
  },
});
