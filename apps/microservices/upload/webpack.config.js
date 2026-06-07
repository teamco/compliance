const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../../dist/apps/microservices/upload'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      tsConfig: 'apps/microservices/upload/tsconfig.app.json',
      compiler: 'tsc',
      main: 'apps/microservices/upload/src/main.ts',
      outputHashing: 'none',
    }),
  ],
};
