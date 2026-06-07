const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../../dist/apps/microservices/ai'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      tsConfig: 'apps/microservices/ai/tsconfig.app.json',
      compiler: 'tsc',
      main: 'apps/microservices/ai/src/main.ts',
      outputHashing: 'none',
    }),
  ],
};
