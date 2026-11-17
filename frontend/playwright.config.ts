import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:5199', headless: true },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5199 --strictPort', url: 'http://127.0.0.1:5199', reuseExistingServer: false, env: { VITE_USE_MOCK: '0' } },
})
