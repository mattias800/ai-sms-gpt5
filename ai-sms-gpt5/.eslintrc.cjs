/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prefer-arrow'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      { allowExpressions: false, allowTypedFunctionExpressions: false },
    ],
    'func-style': ['error', 'expression'],
    'prefer-arrow/prefer-arrow-functions': 'error',
    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    'no-console': 'error',
    eqeqeq: ['error', 'always'],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
};
