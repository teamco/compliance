import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/vendor-risk-client',
  plugins: [tsconfigPaths(), viteStaticCopy({ targets: [{ src: '*.md', dest: '.' }], silent: true })],
  test: {
    name: 'vendor-risk-client',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/vendor-risk-client',
      provider: 'v8' as const,
    },
  },
}));
