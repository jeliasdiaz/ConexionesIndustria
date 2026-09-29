import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.ts';

// Pruebas contra Supabase local (npx supabase start) y Gotenberg (docker compose).
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/integration/**/*.test.ts'],
      setupFiles: ['tests/integration/setup.ts'],
      fileParallelism: false,
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  }),
);
