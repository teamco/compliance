import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/microservices/upload',
  resolve: { tsconfigPaths: true },
  plugins: [],
  test: {
    name: 'upload',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    passWithNoTests: true,
    coverage: {
      reportsDirectory: '../../../coverage/apps/microservices/upload',
      provider: 'v8' as const,
    },
  },
}));
