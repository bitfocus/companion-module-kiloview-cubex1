const PLACEHOLDER_INPUT = { id: 0, label: '- No inputs available -' }
const PLACEHOLDER_OUTPUT = { id: 0, label: '- No outputs available -' }
const PLACEHOLDER_ROTATION = { id: 0, label: '- No playlists available -' }
const PLACEHOLDER_TEMPLATE = { id: 0, label: '- No templates available -' }

function createDefaultState() {
	return {
		panel_id: null,
		panel_name: '',
		panel_detail: null,
		panels: [],
		templates: [],
		rotation_lists: [],
		inputs: [],
		outputs: [],
		system_info: null,
		sn: '',
		version: '',
	}
}

function createDefaultChoiceSets() {
	return {
		CHOICES_INPUTS: [{ ...PLACEHOLDER_INPUT }],
		CHOICES_OUTPUTS: [{ ...PLACEHOLDER_OUTPUT }],
		CHOICES_ROTATION_LISTS: [{ ...PLACEHOLDER_ROTATION }],
		CHOICES_TEMPLATES: [{ ...PLACEHOLDER_TEMPLATE }],
	}
}

module.exports = {
	POLLINGRATE: 1000,
	POLLINGRATE_MAX: 60000,
	POLLINGRATE_RESOURCES: 10000,
	POLLINGRATE_RESOURCES_MAX: 600000,
	RECONNECT_TIME: 30000,
	TOKEN_REFRESH_TIME: 180000,
	REQUEST_TIMEOUT_DEFAULT: 5000,
	REQUEST_BODY_MAX_BYTES: 10 * 1024 * 1024,
	POLL_ERROR_WARNING_THRESHOLD: 3,
	PLACEHOLDER_INPUT,
	PLACEHOLDER_OUTPUT,
	createDefaultState,
	createDefaultChoiceSets,

	CHOICES_LOCK_MODE: [
		{ id: 'lock', label: 'Lock' },
		{ id: 'unlock', label: 'Unlock' },
		{ id: 'toggle', label: 'Toggle' },
	],

	CHOICES_COLLECT_MODE: [
		{ id: 'collect', label: 'Favorite' },
		{ id: 'uncollect', label: 'Unfavorite' },
		{ id: 'toggle', label: 'Toggle' },
	],
}
