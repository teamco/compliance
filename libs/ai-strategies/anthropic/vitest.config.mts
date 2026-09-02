import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/ai-strategies/anthropic',
  resolve: { tsconfigPaths: true },
  plugins: [],
  test: {
    name: 'ai-anthropic',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/ai-strategies/anthropic',
      provider: 'v8' as const,
    },
  },
}));
