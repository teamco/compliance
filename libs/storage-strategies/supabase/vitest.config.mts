import { defineConfig } from 'vitest/config';



export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/storage-strategies/supabase',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'storage-supabase',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/storage-strategies/supabase',
      provider: 'v8' as const,
    },
  },
}));
