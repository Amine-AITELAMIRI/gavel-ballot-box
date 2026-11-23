import { defineConfig } from '@playwright/test'

const port = 5249
const baseURL = 'http://127.0.0.1:' + port

export default defineConfig({
  testDir: '.',
  testMatch: 'links.production.ts',
  outputDir: '../.deepspace/test-results/production-links',
  use: { baseURL, channel: 'chrome' },
  webServer: {
    command: 'npm run build && vite preview --host 127.0.0.1 --strictPort --port ' + port,
    cwd: '..',
    url: baseURL,
    reuseExistingServer: false,
  },
})
