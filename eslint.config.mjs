// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const nodeOnly = ['electron', 'electron/*', 'get-windows', 'electron-log', 'electron-log/*', 'node:*', 'fs', 'path'];

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'database.rules.json', '.claude/worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // 10.4 계층: 렌더러는 Electron과 Node를 직접 쓰지 않는다
    files: ['src/renderer/**/*.{ts,tsx}', 'src/modules/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: nodeOnly }] },
  },
  {
    // 10.5 모듈 규칙 1, 2: ctx로만 바깥에 접근하고 타이머는 ctx.timers로만 만든다
    files: ['src/modules/**/*.{ts,tsx}'],
    ignores: ['src/modules/**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [...nodeOnly, 'firebase', 'firebase/*', '@server/*', '@render/*', '@core/*', '!@core/types', 'react-dom', 'react-dom/*'],
      }],
      'no-restricted-globals': ['error',
        { name: 'setInterval', message: 'ctx.timers.every를 쓰세요' },
        { name: 'setTimeout', message: 'ctx.timers.at을 쓰세요' },
        { name: 'localStorage', message: 'ctx.local을 쓰세요' },
      ],
    },
  },
);
