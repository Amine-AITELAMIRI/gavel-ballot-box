import { defineConfig } from '@playwright/test'
const port = Number(process.env.GAVEL_TEST_PORT || 5208)
const baseURL = 'http://127.0.0.1:' + port
export default defineConfig({
  testDir: '.',
  testMatch: ['smoke.spec.ts', 'api.spec.ts', 'local-review.spec.ts'],
  use: { baseURL, channel: 'chrome', headless: true },
  workers: 1,
  globalTeardown: './teardown.local-review.ts',
  timeout: 60000,
  webServer: {
    command: 'npm run review',
    cwd: '..',
    url: baseURL + '/api/auth/ok',
    env: { GAVEL_REVIEW_PORT: String(port), GAVEL_LOCAL_TEST: '1' },
    reuseExistingServer: false,
    timeout: 90000,
  },
})
