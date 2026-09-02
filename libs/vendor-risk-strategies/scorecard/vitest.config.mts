import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/vendor-risk-strategies/scorecard',
  resolve: { tsconfigPaths: true },
  plugins: [],
  test: {
    name: 'scorecard',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/vendor-risk-strategies/scorecard',
      provider: 'v8' as const,
    },
  },
}));
