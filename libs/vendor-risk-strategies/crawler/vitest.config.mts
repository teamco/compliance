import { defineConfig } from 'vitest/config';



export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/vendor-risk-strategies/crawler',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'crawler',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/vendor-risk-strategies/crawler',
      provider: 'v8' as const,
    },
  },
}));
