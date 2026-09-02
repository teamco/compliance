const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../../dist/apps/microservices/auth'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      tsConfig: 'apps/microservices/auth/tsconfig.app.json',
      compiler: 'swc',
      main: 'apps/microservices/auth/src/main.ts',
      outputHashing: 'none',
    }),
  ],
};
