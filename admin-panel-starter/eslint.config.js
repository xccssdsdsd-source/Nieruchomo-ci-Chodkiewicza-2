import security from 'eslint-plugin-security';
import parser from '@typescript-eslint/parser';

export default [
	{
		ignores: ['node_modules/**', 'worker-configuration.d.ts', 'drizzle/**', 'public/**'],
	},
	{
		files: ['src/**/*.ts', 'scripts/**/*.ts'],
		languageOptions: {
			parser,
			ecmaVersion: 'latest',
			sourceType: 'module',
		},
		plugins: { security },
		rules: {
			...security.configs.recommended.rules,
			'security/detect-object-injection': 'off',
		},
	},
];
