import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (existsSync('.env')) process.loadEnvFile('.env');

// E2E contra la app compilada (npm run build) con Supabase local y Gotenberg.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    // Chromium preinstalado fuera del caché de Playwright (p. ej. contenedores sin descarga).
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: process.env.APP_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    // Las pruebas corren con --conditions=react-server (importan módulos
    // 'server-only' para armar plantillas sintéticas); el servidor no.
    env: { NODE_OPTIONS: '' },
    timeout: 60_000,
  },
});
