//##################################################################
//# ESLint flat config — typescript-eslint type-aware rules across #
//# every workspace package. Keep it strict; the async server code #
//# leans hard on no-floating-promises.                            #
//##################################################################

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/drizzle/**', '**/*.md', '.remember/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Config files and the e2e specs aren't part of a TS project
    files: ['*.mjs', '*.js', '*.ts', 'e2e/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
