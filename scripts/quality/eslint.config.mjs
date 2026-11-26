import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const SHARED_HYGIENE_RULES = {
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-debugger': 'error',
  'no-unneeded-ternary': 'error',
  'no-useless-return': 'error',
  'no-duplicate-imports': 'error',
  'no-self-compare': 'error',
  'no-unreachable-loop': 'error',
  'no-constant-binary-expression': 'error',
  'default-case-last': 'error',
  'no-useless-rename': 'error',
  'object-shorthand': 'error',
};

const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  WebSocket: 'readonly',
  performance: 'readonly',
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  structuredClone: 'readonly',
  globalThis: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'dist-desktop/**',
      'src-tauri/**',
      'src/chapters/generated/**',
      'src/cinematic/generated/**',
      'scripts/harness/out/**',
      'skills/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      ...SHARED_HYGIENE_RULES,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Build DOM with safe element/text builders (h/el), never innerHTML.' },
        { property: 'outerHTML', message: 'Build DOM with safe element/text builders (h/el), never outerHTML.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Build DOM with safe element/text builders (h/el), never insertAdjacentHTML.',
        },
      ],
      'max-depth': ['error', 6],
    },
  },
  {
    files: [
      'scripts/quality/**/*.mjs',
      'scripts/hooks/**/*.mjs',
      'scripts/desktop/**/*.mjs',
      'scripts/mcp/**/*.mjs',
      'scripts/harness/**/*.mjs',
    ],
    languageOptions: {
      globals: NODE_GLOBALS,
    },
    rules: {
      ...SHARED_HYGIENE_RULES,
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'scripts/harness/lib/visual-*.mjs',
      'scripts/harness/*smoke*.mjs',
      'scripts/harness/play-browser.mjs',
      'scripts/harness/screenshot-lab.mjs',
    ],
    languageOptions: {
      globals: {
        ...NODE_GLOBALS,
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        Event: 'readonly',
        HTMLElement: 'readonly',
      },
    },
  },
);
