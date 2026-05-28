/**
 * ESLint v8 配置（与现有 lint script "eslint . --ext ts,tsx ..." 兼容）
 *
 * 设计原则：
 *   1. 仅 src/ 与 src/integrations/ 下的 ts/tsx 走 lint；后端、Electron、构建产物全部 ignore
 *   2. 项目大量使用 any（节点 data 字段是动态 schema），不开 no-explicit-any
 *   3. 未使用变量降为 warn 并允许 _ 前缀；React 19 不需要 react-in-jsx-scope
 *   4. 默认配套规则尽量轻量；用户可按需收紧
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: '19.0' } },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  plugins: ['react-refresh'],
  ignorePatterns: [
    'dist/',
    'dist_electron/',
    'build/',
    'node_modules/',
    'backend/',
    'electron/',
    'data/',
    'input/',
    'output/',
    'thumbnails/',
    'public/',
    'zzenv/',
    '*.config.ts',
    '*.config.js',
    '*.cjs',
    '*.mjs',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'off',
    // React 19 配套 react-hooks v5 新增的两条严格规则，仓库历史代码未按其约束编写
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/refs': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-useless-escape': 'warn',
    'jsx-a11y/alt-text': 'off',
  },
};
