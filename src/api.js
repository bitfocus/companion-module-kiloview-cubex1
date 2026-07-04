const { InstanceStatus } = require('@companion-module/base')

const KiloviewCubeX1 = require('./cubex1')

module.exports = {
	disposeDevice: function (device) {
		if (!device) {
			return
		}

		device
			.logout()
			.catch(() => {})
			.finally(() => {
				device.close()
			})
	},

	parsePollingRate: function (value, min, defaultValue) {
		const rate = parseInt(value, 10)
		if (!Number.isFinite(rate) || rate < min) {
			return defaultValue
		}

		return rate
	},

	handleConnectionFailure: function (error, context) {
		let self = this

		self.log('error', `${context}: ${error.message}`)
		self.updateStatus(InstanceStatus.ConnectionFailure)
		self.stopIntervals()
		self.startReconnectInterval()
	},

	stopIntervals: function () {
		let self = this

		clearInterval(self.INTERVAL)
		clearInterval(self.INTERVAL_RESOURCES)
		clearInterval(self.TOKEN_INTERVAL)
		clearTimeout(self.RECONNECT_INTERVAL)

		self.INTERVAL = null
		self.INTERVAL_RESOURCES = null
		self.TOKEN_INTERVAL = null
		self.RECONNECT_INTERVAL = null
	},

	async initConnection() {
		let self = this

		self.stopIntervals()

		const previousDevice = self.DEVICE
		self.DEVICE = null
		self.disposeDevice(previousDevice)

		if (self.config.host && self.config.host !== '') {
			self.updateStatus(InstanceStatus.Connecting)
			self.log('info', `Opening connection to ${self.config.host}`)

			self.DEVICE = new KiloviewCubeX1(
				self,
				self.config.host,
				self.config.username,
				self.config.password,
				self.config.protocol,
				self.config.port,
			)

			try {
				self.log('info', 'Attempting to log in...')
				await self.DEVICE.login()
			} catch (error) {
				if (error.authFailure === true) {
					self.log('error', 'Login failed. Check your username and password and try again.')
					self.updateStatus(InstanceStatus.ConnectionFailure, 'Login Failed. See log.')
				} else {
					self.log('error', 'Could not reach device: ' + error.message + '. Retrying in 30 seconds.')
					self.updateStatus(InstanceStatus.ConnectionFailure)
					self.startReconnectInterval()
				}
				return
			}

			self.updateStatus(InstanceStatus.Ok)
			self.log('info', `Connected to CUBE X1 as user: ${self.config.username}`)

			await self.checkSystemInfo()
			await self.checkState()

			self.initActions()
			self.initFeedbacks()
			self.initVariables()
			self.initPresets()

			self.checkAllFeedbacks()
			self.checkVariables()

			self.startIntervals()
		}
	},

	startReconnectInterval: function () {
		let self = this

		self.updateStatus(InstanceStatus.ConnectionFailure, 'Reconnecting')

		if (self.RECONNECT_INTERVAL !== undefined && self.RECONNECT_INTERVAL !== null) {
			clearTimeout(self.RECONNECT_INTERVAL)
			self.RECONNECT_INTERVAL = null
		}

		self.log('info', 'Attempting to reconnect in 30 seconds...')

		self.RECONNECT_INTERVAL = setTimeout(self.initConnection.bind(self), self.RECONNECT_TIME)
	},

	startIntervals: function () {
		let self = this

		// Refresh the session token regularly; it is only valid for ~5 minutes
		self.TOKEN_INTERVAL = setInterval(async () => {
			if (!self.DEVICE) {
				return
			}

			try {
				await self.DEVICE.refreshToken()
				if (self.config.verbose) {
					self.log('debug', 'Session token refreshed.')
				}
			} catch (error) {
				if (error.unreachable === true || error.authFailure === true) {
					self.handleConnectionFailure(error, 'Session refresh failed')
					return
				}

				self.log('error', 'Error refreshing session token: ' + error.message)
			}
		}, self.TOKEN_REFRESH_TIME)

		if (self.config.polling) {
			const pollingRate = self.parsePollingRate(self.config.pollingrate, 500, self.POLLINGRATE)
			const pollingRateResources = self.parsePollingRate(
				self.config.pollingrate_resources,
				1000,
				self.POLLINGRATE_RESOURCES,
			)

			self.log('info', `Starting Update Interval: Fetching new data from Device every ${pollingRate}ms.`)
			self.INTERVAL = setInterval(self.checkState.bind(self), pollingRate)
			self.INTERVAL_RESOURCES = setInterval(self.checkSystemInfo.bind(self), pollingRateResources)
		} else {
			self.log(
				'info',
				'Polling is disabled. Module will not request new data at a regular rate. Feedbacks and Variables will not update.',
			)
		}
	},

	/**
	 * Poll panel / routing state. This is the main poll loop.
	 */
	async checkState() {
		let self = this

		if (!self.DEVICE || self.STATE_CHECK_IN_FLIGHT) {
			return
		}

		self.STATE_CHECK_IN_FLIGHT = true

		try {
			// Determine the panel to use (the CUBE X1 exposes one panel, typically "default")
			const panels = await self.DEVICE.queryPanel()

			if (panels?.msg instanceof Array && panels.msg.length > 0) {
				self.STATE.panels = panels.msg
				self.STATE.panel_id = panels.msg[0].id
				self.STATE.panel_name = panels.msg[0].name
			}

			if (self.STATE.panel_id === null || self.STATE.panel_id === undefined) {
				self.log('error', 'No panel found on device.')
				return
			}

			const detail = await self.DEVICE.queryPanelDetail(self.STATE.panel_id)

			if (detail?.msg) {
				self.STATE.panel_detail = detail.msg
				self.STATE.inputs = detail.msg.panel_inputs || []
				self.STATE.outputs = detail.msg.panel_outputs || []
				self.STATE.templates = detail.msg.panel_templates || []
				self.STATE.rotation_lists = detail.msg.rotation_lists || []
			}

			self.updateStatus(InstanceStatus.Ok)
		} catch (error) {
			if (error.unreachable === true) {
				self.handleConnectionFailure(error, 'Error getting panel state')
				return
			}

			if (self.config.verbose) {
				self.log('debug', 'Error getting panel state: ' + error.message)
			}
		} finally {
			self.STATE_CHECK_IN_FLIGHT = false
		}

		self.rebuildChoices()

		self.checkAllFeedbacks()
		self.checkVariables()
	},

	/**
	 * Poll slow-changing data (system info, version).
	 */
	async checkSystemInfo() {
		let self = this

		if (!self.DEVICE) {
			return
		}

		try {
			const info = await self.DEVICE.getSystemInfo()
			self.STATE.system_info = info?.msg || null
		} catch (error) {
			if (error.unreachable === true) {
				self.handleConnectionFailure(error, 'Error getting system info')
				return
			}

			self.log('error', 'Error getting system info: ' + error.message)
		}

		try {
			const version = await self.DEVICE.getVersion()
			self.STATE.sn = version?.msg?.sn || ''
			self.STATE.version = version?.msg?.version || ''
		} catch (error) {
			if (error.unreachable === true) {
				self.handleConnectionFailure(error, 'Error getting version')
				return
			}

			self.log('error', 'Error getting version: ' + error.message)
		}
	},

	/**
	 * Rebuild the dropdown choices used by actions/feedbacks/presets from the
	 * current panel state. Re-initializes the definitions if anything changed.
	 */
	rebuildChoices: function () {
		let self = this

		let inputChoices = self.STATE.inputs.map((input) => ({
			id: input.id,
			label: input.alias || input.name || `Input ${input.id}`,
		}))
		if (inputChoices.length === 0) {
			inputChoices = [{ id: 0, label: '- No inputs available -' }]
		}

		let outputChoices = self.STATE.outputs.map((output) => ({
			id: output.id,
			label: output.alias || output.name || `Output ${output.id}`,
		}))
		if (outputChoices.length === 0) {
			outputChoices = [{ id: 0, label: '- No outputs available -' }]
		}

		let rotationChoices = self.STATE.rotation_lists.map((list) => ({
			id: list.id,
			label: list.name || `Playlist ${list.id}`,
		}))
		if (rotationChoices.length === 0) {
			rotationChoices = [{ id: 0, label: '- No playlists available -' }]
		}

		let templateChoices = self.STATE.templates.map((template) => ({
			id: template.id,
			label: template.name || `Template ${template.id}`,
		}))
		if (templateChoices.length === 0) {
			templateChoices = [{ id: 0, label: '- No templates available -' }]
		}

		const changed =
			JSON.stringify(self.CHOICES_INPUTS) !== JSON.stringify(inputChoices) ||
			JSON.stringify(self.CHOICES_OUTPUTS) !== JSON.stringify(outputChoices) ||
			JSON.stringify(self.CHOICES_ROTATION_LISTS) !== JSON.stringify(rotationChoices) ||
			JSON.stringify(self.CHOICES_TEMPLATES) !== JSON.stringify(templateChoices)

		if (changed) {
			self.log('info', 'Inputs/Outputs/Playlists/Templates have changed. Updating choices...')
			self.CHOICES_INPUTS = inputChoices
			self.CHOICES_OUTPUTS = outputChoices
			self.CHOICES_ROTATION_LISTS = rotationChoices
			self.CHOICES_TEMPLATES = templateChoices

			self.initActions()
			self.initFeedbacks()
			self.initVariables()
			self.initPresets()
		}
	},

	getOutputById: function (output_id) {
		let self = this
		return self.STATE.outputs.find((output) => output.id == output_id)
	},

	getInputById: function (input_src_id) {
		let self = this
		return self.STATE.inputs.find((input) => input.id == input_src_id)
	},

	getActiveTemplate: function () {
		let self = this
		return self.STATE.templates.find((template) => template.start === true)
	},
}
