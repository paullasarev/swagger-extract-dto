const { terser } = require('rollup-plugin-terser');
// const copy = require('rollup-plugin-copy');

// const isProduction = process.env.BUILD === 'production';

export default [
  {
    input: 'src/cli/swagger-extract-dto.js',
    output: {
      file: 'dist/bundle.js',
      format: 'cjs',
    },
    plugins: [
      // terser(),
      // copy({
      //   targets: [{ src: 'src/index.d.ts', dest: 'dist', rename: 'json-schema-toolbox.d.ts' }]
      // }),
    ],
    external: ['lodash', 'lodash/fp', 'fs', 'path', 'resolve', 'glob'],
  },
];
