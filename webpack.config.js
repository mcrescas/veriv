//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'webworker',
  entry: {
    extension: {
      import: './src/vscode/extension.ts',
      filename: '[name].js',
    },
    viewer: {
      import: './src/viewer/viewer.ts',
      filename: '../dist/[name].js',
      library: {
        type: 'window',
        name: 'Viewer'
      }
    },
    worker_prime: {
      import: './src/viewer/workers/worker_prime.js',
      filename: '[name].js',
      library: {
        type: 'self',
        name: 'WorkerPrime'
      }
    }
  },
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  externals: {
    vscode: 'commonjs vscode' 
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'], //
    extensions: ['.ts', '.js'],
    alias: {
      // provides alternate implementation for node module and source files
    },
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.html$/i,
        loader: "html-loader",
      },
      {
        test: /\.css$/i,
        type: 'asset/source',
      },
      {
        test: /\.glsl$/i,
        type: 'asset/source',
      },
    ]
  },
  optimization: {
    minimizer: [
      `...`,
      new CssMinimizerPlugin(),
    ],
  },
};
module.exports = config;
