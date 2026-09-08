import { defineConfig } from '@playwright/test'

// E2E mínimo sobre Electron (brief §10). No usa navegadores de Playwright:
// `_electron` arranca la propia app. Requiere `out/` compilado (`npm run build`).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']]
})
