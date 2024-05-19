const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: {
      resolve: {
        fallback: {
          "path": require.resolve("path-browserify"),
          "fs": require.resolve("browserify-fs"),
          "crypto": require.resolve("crypto-browserify"),
          "util": require.resolve("util/"),
          "stream": require.resolve("stream-browserify"),
          "vm": require.resolve("vm-browserify"),
          "process": require.resolve("process/browser"),
          "buffer": require.resolve("buffer/")
        }
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        process: 'process/browser',
        Buffer: ['buffer', 'Buffer'],
      }),
      // other plugins...
    ]
  }
};
