export default [
	function migratePasswordToSecrets(_context, props) {
		const result = {
			updatedConfig: null,
			updatedSecrets: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}

		if (!props.config?.password) {
			return result
		}

		result.updatedConfig = { ...props.config }
		delete result.updatedConfig.password

		result.updatedSecrets = {
			...(props.secrets || {}),
			password: props.config.password,
		}

		return result
	},
]
