const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../../dist/apps/microservices/vendor-risk'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      tsConfig: 'apps/microservices/vendor-risk/tsconfig.app.json',
      compiler: 'tsc',
      main: 'apps/microservices/vendor-risk/src/main.ts',
      outputHashing: 'none',
    }),
  ],
};
