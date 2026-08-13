import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  eslintConfigPrettier,
);

export function defineConfig(overrides = []) {
  return [
    {
      ignores: [
        'dist/**',
        'node_modules/**',
        '.turbo/**',
        'coverage/**',
        'eslint.config.mjs',
      ],
    },
    ...base,
    ...(Array.isArray(overrides) ? overrides : [overrides]),
  ];
}

export default defineConfig();
