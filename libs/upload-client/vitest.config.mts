import { defineConfig } from 'vitest/config';



export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/upload-client',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'upload-client',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/upload-client',
      provider: 'v8' as const,
    },
  },
}));
