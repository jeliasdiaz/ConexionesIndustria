import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

// Pruebas contra Supabase local (npm run db:start) y Gotenberg (docker compose).
// Sin mergeConfig: concatenaría `include` con el de las unitarias.
export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
