import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/storage-strategies/supabase',
  plugins: [tsconfigPaths(), viteStaticCopy({ targets: [{ src: '*.md', dest: '.' }], silent: true })],
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
