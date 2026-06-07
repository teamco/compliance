const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      tsConfig: 'apps/api/tsconfig.app.json',
      compiler: 'tsc',
      main: 'apps/api/src/main.ts',
      outputHashing: 'none',
    }),
  ],
};
