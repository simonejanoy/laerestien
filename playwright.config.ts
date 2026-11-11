import { defineConfig } from '@playwright/test'

// Nettlesertester (Playwright) for elevvisningen. Kjør: npm run test:e2e
// Testene bruker testsiden e2e/harness.html, som viser de samme komponentene som appen uten innlogging og uten
// Firebase. Den lokale Chrome-installasjonen brukes, så ingen nettlesere lastes ned.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    channel: 'chrome',
    viewport: { width: 1100, height: 1000 },
  },
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/e2e/harness.html',
    reuseExistingServer: !process.env.CI,
  },
})
