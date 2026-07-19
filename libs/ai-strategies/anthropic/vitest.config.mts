import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/ai-strategies/anthropic',
  plugins: [tsconfigPaths(), viteStaticCopy({ targets: [{ src: '*.md', dest: '.' }], silent: true })],
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
