module.exports = {
  root: true,
  extends: 'standard',
  // parser: '@typescript-eslint/parser',
  // plugins: ['@typescript-eslint', 'import', 'jest'],
  plugins: ['import', 'jest'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
      },
    },
    'import/external-module-folders': ['node_modules'],
    'import/extensions': ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
  },
  env: {
    browser: true,
    node: true,
    jest: true,
  },
  rules: {
    // 'react-hooks/exhaustive-deps': 'error',
    // '@typescript-eslint/no-unused-vars': [2, { args: 'none' }],
    'jest/no-disabled-tests': 0,
    'jest/no-identical-title': 'error',
    'prefer-const': 'error',
    'no-console': 'error',
    quotes: [2, 'single', 'avoid-escape'],
    eqeqeq: 'error',
    'no-shadow': 'error',
    // 'react-native/no-inline-styles': 0,
    'no-array-constructor': 'error',
    'import/order': 'error',
    'import/newline-after-import': 'error',
    'import/no-unresolved': 'error',
    'import/no-useless-path-segments': 'error',
    'import/no-duplicates': 'error',
    // 'react/jsx-no-bind': 'error',
    // 'react/jsx-pascal-case': 'error',
    'vars-on-top': 'error',
    // 'redux-complexity/redux-complexity': ['error', { max: 7 }]
  },
};
