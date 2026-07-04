module.exports = {
	POLLINGRATE: 1000,
	POLLINGRATE_RESOURCES: 10000,
	RECONNECT_TIME: 30000,
	TOKEN_REFRESH_TIME: 180000, // tokens are valid for ~5 minutes, refresh every 3
	DEVICE: undefined,

	CHOICES_INPUTS: [{ id: 0, label: '- No inputs available -' }],
	CHOICES_OUTPUTS: [{ id: 0, label: '- No outputs available -' }],
	CHOICES_ROTATION_LISTS: [{ id: 0, label: '- No playlists available -' }],
	CHOICES_TEMPLATES: [{ id: 0, label: '- No templates available -' }],

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

	STATE: {
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
	},

	INTERVAL: null,
	INTERVAL_RESOURCES: null,
	RECONNECT_INTERVAL: null,
	TOKEN_INTERVAL: null,
	STATE_CHECK_IN_FLIGHT: false,
	SYSTEM_INFO_CHECK_IN_FLIGHT: false,
	CONNECTION_GENERATION: 0,
	INIT_CONNECTION_PROMISE: null,
	_destroyed: false,
}
