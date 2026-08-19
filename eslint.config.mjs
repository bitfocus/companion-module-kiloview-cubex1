import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: false,
	commonRules: {
		'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
	},
})

export default [
	...baseConfig,
	{
		// This module is ESM ("type": "module"), but the shared config only opts *.mjs into
		// module syntax, so .js sources would otherwise fail to parse.
		files: ['**/*.js'],
		languageOptions: {
			sourceType: 'module',
		},
	},
]
