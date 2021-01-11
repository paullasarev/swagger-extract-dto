// const { terser } = require('rollup-plugin-terser');
// import resolve from 'rollup-plugin-node-resolve';
// import commonjs from 'rollup-plugin-commonjs';
// import json from 'rollup-plugin-json';
// const copy = require('rollup-plugin-copy');

// const isProduction = process.env.BUILD === 'production';

export default [
  {
    input: 'src/cli/swagger-extract-dto.js',
    output: {
      file: 'dist/swagger-extract-dto.js',
      format: 'cjs',
      // strict: false,
      banner: '#! /usr/bin/env node\n',
    },
    plugins: [
      // resolve(),
      // json(),
      // commonjs({ include: 'node_modules/**' }),
      // terser(),
      // copy({
      //   targets: [{ src: 'src/index.d.ts', dest: 'dist', rename: 'json-schema-toolbox.d.ts' }]
      // }),
    ],
    external: [
      'lodash',
      'lodash/fp',
      'fs',
      'path',
      'resolve',
      'glob',
      'util',
      'yargs/yargs',
      'yargs/helpers',
      'mkdirp',
      'typescript',
      'rimraf',
      'prettier',
      'json-schema-ref-parser',
    ],
  },
];
