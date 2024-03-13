module.exports = {
  root: true,
  env: {
    browser: false,
    es6: true,
    // jest: true,
    mocha: true,
  },
  extends: [
    'airbnb-base',
    // 'plugin:jest/all',
    'plugin:mocha/recommended',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: [
    // 'jest',
    'mocha',
  ],
  rules: {
    'max-classes-per-file': 'off',
    'no-underscore-dangle': 'off',
    'no-console': 'off',
    'no-shadow': 'off',
    'no-restricted-syntax': [
      'error',
      'LabeledStatement',
      'WithStatement',
    ],

    'func-names': 'off',
    'prefer-arrow-callback': 'off',
    'consistent-return': 'off',
    'no-unused-expressions': 'off',
  },
  overrides: [
    {
      files: ['*.js'],
      excludedFiles: 'babel.config.js',
    },
  ],
};
