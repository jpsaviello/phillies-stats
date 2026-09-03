import { defineConfig } from 'vitest/config'

/**
 * Kept separate from vite.config.ts on purpose: that file carries the dev/preview
 * proxy to the backend on :8080, and nothing under test here talks to it. Every
 * suite exercises a pure module — no DOM, no fetch, no dev server — which is why
 * the environment is plain node rather than jsdom.
 *
 * Tests live beside the code they cover (src/utils/__tests__), so tsconfig.app's
 * `include: ["src"]` type-checks them as part of `npm run build` too.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The ET date helpers are the point of several suites; pinning the runner's
    // zone to something that is NOT Eastern is what makes a regression to
    // local-timezone math actually fail here instead of passing in CI by luck.
    env: { TZ: 'America/Los_Angeles' },
  },
})
