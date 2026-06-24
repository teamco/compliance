import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/db-strategies/supabase',
  resolve: { tsconfigPaths: true },
  plugins: [],
  test: {
    name: 'db-supabase',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/db-strategies/supabase',
      provider: 'v8' as const,
    },
  },
}));
