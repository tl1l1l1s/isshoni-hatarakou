import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@core': resolve('src/renderer/core'),
      '@server': resolve('src/renderer/server'),
      '@render': resolve('src/renderer/render'),
      '@modules': resolve('src/modules'),
    },
  },
  test: { include: ['src/**/*.test.ts', 'rules/**/*.test.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'] },
});
