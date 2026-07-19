import { defineConfig } from 'vitest/config';



export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/notes-client',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'notes-client',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/notes-client',
      provider: 'v8' as const,
    },
  },
}));
