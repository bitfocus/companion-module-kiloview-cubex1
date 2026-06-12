const { Regex } = require('@companion-module/base')

module.exports = {
	getConfigFields() {
		let self = this

		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					'This module controls the Kiloview CUBE X1 NDI distribution system. It supports matrix routing of NDI sources to outputs, playlists, output locking/favorites and panel templates.',
			},
			{
				type: 'static-text',
				id: 'hr1',
				width: 12,
				label: ' ',
				value: '<hr />',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Device IP / Host',
				width: 6,
				default: '',
				regex: Regex.HOSTNAME,
			},
			{
				type: 'dropdown',
				id: 'protocol',
				label: 'Protocol',
				width: 3,
				default: 'http',
				choices: [
					{ id: 'http', label: 'HTTP (port: 80)' },
					{ id: 'https', label: 'HTTPS (port: 443)' },
				],
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Port',
				width: 3,
				default: '80',
				regex: Regex.PORT,
			},
			{
				type: 'static-text',
				id: 'hr2',
				width: 12,
				label: ' ',
				value: '<hr />',
			},
			{
				type: 'textinput',
				label: 'Username',
				id: 'username',
				width: 3,
				default: 'admin',
			},
			{
				type: 'textinput',
				label: 'Password',
				id: 'password',
				width: 3,
				default: 'Admin123',
			},
			{
				type: 'static-text',
				id: 'authInfo',
				width: 6,
				label: ' ',
				value: 'The CUBE X1 requires a valid user login. The module keeps the session token refreshed automatically.',
			},
			{
				type: 'static-text',
				id: 'hr3',
				width: 12,
				label: ' ',
				value: '<hr />',
			},
			{
				type: 'checkbox',
				id: 'polling',
				label: 'Enable Polling (necessary for feedbacks and variables)',
				default: true,
				width: 3,
				disableAutoExpression: true,
			},
			{
				type: 'textinput',
				id: 'pollingrate',
				label: 'Polling Rate for Panel State (in ms)',
				default: self.POLLINGRATE,
				width: 3,
				isVisibleExpression: '!!$(options:polling)',
			},
			{
				type: 'textinput',
				id: 'pollingrate_resources',
				label: 'Polling Rate for System Info / Version (in ms)',
				default: self.POLLINGRATE_RESOURCES,
				width: 3,
				isVisibleExpression: '!!$(options:polling)',
			},
			{
				type: 'static-text',
				id: 'hr4',
				width: 12,
				label: ' ',
				value: '<hr />',
			},
			{
				type: 'checkbox',
				id: 'verbose',
				label: 'Enable Verbose Logging',
				default: false,
				width: 3,
			},
			{
				type: 'static-text',
				id: 'verboseInfo',
				width: 9,
				label: ' ',
				value:
					'Enabling Verbose Logging will push all incoming and outgoing data to the log, which is helpful for debugging.',
			},
		]
	},
}
