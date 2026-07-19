import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/microservices/upload',
  plugins: [tsconfigPaths(), viteStaticCopy({ targets: [{ src: '*.md', dest: '.' }], silent: true })],
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
