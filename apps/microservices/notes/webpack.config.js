const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../../dist/apps/microservices/notes'),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      tsConfig: 'apps/microservices/notes/tsconfig.app.json',
      compiler: 'tsc',
      main: 'apps/microservices/notes/src/main.ts',
      outputHashing: 'none',
    }),
  ],
};
