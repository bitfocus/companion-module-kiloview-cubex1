import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: false,
	commonRules: {
		'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
	},
})

export default [...baseConfig]
