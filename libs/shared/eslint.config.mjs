import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
            '{projectRoot}/src/**/*.{spec,test}.{js,ts,jsx,tsx}',
            '{projectRoot}/src/**/__tests__/**/*.{js,ts,jsx,tsx}',
          ],
          // `express` is imported type-only (`import type { Request, Response } from 'express'`)
          // for compile-time types only; the runtime package is intentionally NOT a dependency
          // of this library. `@types/express` (devDependency) satisfies the type resolution.
          ignoredDependencies: ['express'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
