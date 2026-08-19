import { InstanceStatus } from '@companion-module/base'

import KiloviewCubeX1 from './cubex1.js'
import constants from './constants.js'

/**
 * The device is the source of these values; a firmware quirk or a partial response can send
 * something other than the documented array. Coerce so downstream `.map()`/`.find()` cannot throw.
 */
function asArray(value) {
	return Array.isArray(value) ? value : []
}

export default {
	disposeDevice: function (device) {
		if (!device) {
			return Promise.resolve()
		}

		return device
			.logout()
			.catch(() => {})
			.finally(() => {
				device.close()
			})
	},

	isConnectionCurrent: function (generation, device) {
		return this.CONNECTION_GENERATION === generation && this.DEVICE === device
	},

	disposeCurrentDevice: function () {
		const device = this.DEVICE
		this.DEVICE = null
		return this.disposeDevice(device)
	},

	parsePollingRate: function (value, min, max, defaultValue) {
		const rate = parseInt(value, 10)
		if (!Number.isFinite(rate) || rate < min) {
			return defaultValue
		}

		if (rate > max) {
			return max
		}

		return rate
	},

	resetRuntimeState: function () {
		let self = this

		Object.assign(self.STATE, constants.createDefaultState())

		const choices = constants.createDefaultChoiceSets()
		self.CHOICES_INPUTS = choices.CHOICES_INPUTS
		self.CHOICES_OUTPUTS = choices.CHOICES_OUTPUTS
		self.CHOICES_ROTATION_LISTS = choices.CHOICES_ROTATION_LISTS
		self.CHOICES_TEMPLATES = choices.CHOICES_TEMPLATES

		self.POLL_ERROR_COUNT = 0

		self.initActions()
		self.initFeedbacks()
		self.initVariables()
		self.initPresets()
		self.checkAllFeedbacks()
		self.checkVariables()
	},

	clearPanelState: function () {
		let self = this

		self.STATE.panels = []
		self.STATE.panel_id = null
		self.STATE.panel_name = ''
		self.STATE.panel_detail = null
		self.STATE.inputs = []
		self.STATE.outputs = []
		self.STATE.templates = []
		self.STATE.rotation_lists = []
	},

	resolvePanelFromList: function (panels) {
		let self = this

		if (!(panels instanceof Array) || panels.length === 0) {
			return null
		}

		const configured = self.config.panel_id
		if (configured !== undefined && configured !== null && String(configured).trim() !== '') {
			const configuredId = parseInt(configured, 10)
			if (Number.isFinite(configuredId)) {
				const match = panels.find((panel) => panel.id == configuredId)
				if (match) {
					return match
				}

				self.log('warn', `Configured panel ID ${configuredId} was not found. Using the first available panel.`)
			}
		}

		return panels[0]
	},

	isPlaceholderChoiceId: function (value) {
		return value === 0 || value === '0'
	},

	canRunPanelAction: function () {
		let self = this

		if (!self.DEVICE) {
			return false
		}

		if (self.STATE.panel_id === null || self.STATE.panel_id === undefined) {
			self.log('error', 'Action skipped: no panel is available on the device.')
			return false
		}

		return true
	},

	handleConnectionFailure: function (error, context) {
		let self = this

		if (self._destroyed) {
			return Promise.resolve()
		}

		self.log('error', `${context}: ${error.message}`)
		self.updateStatus(InstanceStatus.ConnectionFailure)
		self.stopIntervals()

		// Arm the retry before disposing. We only get here because the device is unreachable, so
		// the logout() inside dispose runs to its full request timeout; waiting on it would push
		// the first reconnect attempt out by that much. The dispose promise is still returned so
		// callers keep propagating its errors.
		self.startReconnectInterval()

		return self.disposeCurrentDevice()
	},

	handleAuthFailure: function (error, context) {
		let self = this

		if (self._destroyed) {
			return Promise.resolve()
		}

		self.log('error', `${context}: ${error.message}`)
		self.updateStatus(InstanceStatus.AuthenticationFailure, 'Authentication failed. Check credentials.')
		self.stopIntervals()
		return self.disposeCurrentDevice().then(() => {
			self.resetRuntimeState()
		})
	},

	handleRequestError: function (error, context) {
		if (this._destroyed) {
			return Promise.resolve()
		}

		if (error.authFailure === true) {
			return this.handleAuthFailure(error, context)
		}

		if (error.unreachable === true) {
			return this.handleConnectionFailure(error, context)
		}

		this.log('error', `${context}: ${error.message}`)
		return Promise.resolve()
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

	async refreshStateAfterAction() {
		let self = this

		// A poll may already be in flight; wait for it to settle so the follow-up read sees
		// post-action state rather than racing the request that is already open.
		if (self.STATE_CHECK_PROMISE) {
			await self.STATE_CHECK_PROMISE.catch(() => {})
		}

		await self.checkState()
	},

	async initConnection() {
		let self = this

		const run = async () => {
			if (self._destroyed) {
				return
			}

			self.stopIntervals()

			self.CONNECTION_GENERATION++
			const generation = self.CONNECTION_GENERATION

			const previousDevice = self.DEVICE
			self.DEVICE = null
			await self.disposeDevice(previousDevice)
			self.resetRuntimeState()

			if (!self.config.host || self.config.host === '') {
				self.updateStatus(InstanceStatus.Disconnected, 'No host configured')
				return
			}

			if (!self.isConnectionCurrent(generation, null)) {
				return
			}

			self.updateStatus(InstanceStatus.Connecting)
			self.log('info', `Opening connection to ${self.config.host}`)

			const device = new KiloviewCubeX1(
				self,
				self.config.host,
				self.config.username,
				self.getPassword(),
				self.config.protocol,
				self.config.port,
				{
					rejectUnauthorized: self.config.verify_tls === true,
					requestTimeout: self.config.request_timeout,
					maxBodyBytes: self.REQUEST_BODY_MAX_BYTES,
				},
			)
			self.DEVICE = device

			try {
				self.log('info', 'Attempting to log in...')
				await device.login()
			} catch (error) {
				if (!self.isConnectionCurrent(generation, device)) {
					return
				}

				self.DEVICE = null
				await self.disposeDevice(device)

				if (error.authFailure === true) {
					self.log('error', 'Login failed. Check your username and password and try again.')
					self.resetRuntimeState()
					self.updateStatus(InstanceStatus.AuthenticationFailure, 'Login failed. See log.')
					return
				}

				self.log('error', 'Could not reach device: ' + error.message + '. Retrying in 30 seconds.')
				self.updateStatus(InstanceStatus.ConnectionFailure)
				self.startReconnectInterval()
				return
			}

			if (!self.isConnectionCurrent(generation, device)) {
				return
			}

			self.updateStatus(InstanceStatus.Ok)
			self.log('info', `Connected to CUBE X1 as user: ${self.config.username}`)

			await self.checkSystemInfo(generation, device)
			if (!self.isConnectionCurrent(generation, device)) {
				return
			}

			await self.checkState(generation, device)
			if (!self.isConnectionCurrent(generation, device)) {
				return
			}

			self.checkAllFeedbacks()
			self.checkVariables()

			if (!self.isConnectionCurrent(generation, device)) {
				return
			}

			self.startIntervals()
		}

		self.INIT_CONNECTION_PROMISE = (self.INIT_CONNECTION_PROMISE || Promise.resolve()).then(run).catch((error) => {
			self.log('error', 'initConnection error: ' + error.message)
		})

		return self.INIT_CONNECTION_PROMISE
	},

	startReconnectInterval: function () {
		let self = this

		if (self._destroyed || !self.config.host || self.config.host === '') {
			return
		}

		self.updateStatus(InstanceStatus.ConnectionFailure, 'Reconnecting')

		if (self.RECONNECT_INTERVAL !== undefined && self.RECONNECT_INTERVAL !== null) {
			clearTimeout(self.RECONNECT_INTERVAL)
			self.RECONNECT_INTERVAL = null
		}

		self.log('info', 'Attempting to reconnect in 30 seconds...')

		self.RECONNECT_INTERVAL = setTimeout(() => {
			if (self._destroyed) {
				return
			}

			self.initConnection().catch(() => {})
		}, self.RECONNECT_TIME)
	},

	async refreshSessionToken() {
		let self = this

		const device = self.DEVICE
		if (!device || self.TOKEN_REFRESH_IN_FLIGHT) {
			return
		}

		self.TOKEN_REFRESH_IN_FLIGHT = true

		try {
			await device.refreshToken()
			if (self.config.verbose) {
				self.log('debug', 'Session token refreshed.')
			}
		} catch (error) {
			await self.handleRequestError(error, 'Session refresh failed')
		} finally {
			self.TOKEN_REFRESH_IN_FLIGHT = false
		}
	},

	startIntervals: function () {
		let self = this

		self.TOKEN_INTERVAL = setInterval(() => {
			self.refreshSessionToken().catch((error) => self.log('error', 'Session refresh failed: ' + error.message))
		}, self.TOKEN_REFRESH_TIME)

		if (self.config.polling) {
			const pollingRate = self.parsePollingRate(self.config.pollingrate, 500, self.POLLINGRATE_MAX, self.POLLINGRATE)
			const pollingRateResources = self.parsePollingRate(
				self.config.pollingrate_resources,
				1000,
				self.POLLINGRATE_RESOURCES_MAX,
				self.POLLINGRATE_RESOURCES,
			)

			self.log('info', `Starting Update Interval: Fetching new data from Device every ${pollingRate}ms.`)
			// Timer callbacks are never awaited, so an escaping rejection would be fatal to the process.
			self.INTERVAL = setInterval(() => {
				self.checkState().catch((error) => self.log('error', 'Error polling panel state: ' + error.message))
			}, pollingRate)
			self.INTERVAL_RESOURCES = setInterval(() => {
				self.checkSystemInfo().catch((error) => self.log('error', 'Error polling system info: ' + error.message))
			}, pollingRateResources)
		} else {
			self.log(
				'info',
				'Polling is disabled. Module will not request new data at a regular rate. Feedbacks and Variables will not update.',
			)
		}
	},

	async checkState(generation, device) {
		let self = this

		if (generation === undefined) {
			generation = self.CONNECTION_GENERATION
		}
		if (device === undefined) {
			device = self.DEVICE
		}

		if (!device || !self.isConnectionCurrent(generation, device) || self.STATE_CHECK_IN_FLIGHT) {
			return
		}

		self.STATE_CHECK_IN_FLIGHT = true

		// Published so refreshStateAfterAction() can await the running check instead of polling a flag.
		const run = self._checkStateOnce(generation, device).finally(() => {
			self.STATE_CHECK_IN_FLIGHT = false
			if (self.STATE_CHECK_PROMISE === run) {
				self.STATE_CHECK_PROMISE = null
			}
		})
		self.STATE_CHECK_PROMISE = run

		return run
	},

	async _checkStateOnce(generation, device) {
		let self = this

		try {
			const panels = await device.queryPanel()
			if (!self.isConnectionCurrent(generation, device)) {
				return
			}

			if (panels?.msg instanceof Array && panels.msg.length > 0) {
				self.STATE.panels = panels.msg
				const panel = self.resolvePanelFromList(panels.msg)
				if (panel) {
					self.STATE.panel_id = panel.id
					self.STATE.panel_name = panel.name
				}
			} else {
				self.clearPanelState()
			}

			if (self.STATE.panel_id === null || self.STATE.panel_id === undefined) {
				self.log('error', 'No panel found on device.')
				self.updateStatus(InstanceStatus.UnknownWarning, 'No panel found on device')
			} else {
				const detail = await device.queryPanelDetail(self.STATE.panel_id)
				if (!self.isConnectionCurrent(generation, device)) {
					return
				}

				if (detail?.msg) {
					self.STATE.panel_detail = detail.msg
					self.STATE.inputs = asArray(detail.msg.panel_inputs)
					self.STATE.outputs = asArray(detail.msg.panel_outputs)
					self.STATE.templates = asArray(detail.msg.panel_templates)
					self.STATE.rotation_lists = asArray(detail.msg.rotation_lists)
				}

				self.POLL_ERROR_COUNT = 0
				self.updateStatus(InstanceStatus.Ok)
			}
		} catch (error) {
			if (error.unreachable === true || error.authFailure === true) {
				await self.handleRequestError(error, 'Error getting panel state')
				return
			}

			self.log('error', 'Error getting panel state: ' + error.message)
			self.POLL_ERROR_COUNT++
			if (self.POLL_ERROR_COUNT >= self.POLL_ERROR_WARNING_THRESHOLD) {
				self.updateStatus(InstanceStatus.UnknownWarning, 'Repeated errors polling panel state')
			}
		}

		if (!self.isConnectionCurrent(generation, device)) {
			return
		}

		self.rebuildChoices()

		self.checkAllFeedbacks()
		self.checkVariables()
	},

	async checkSystemInfo(generation, device) {
		let self = this

		if (generation === undefined) {
			generation = self.CONNECTION_GENERATION
		}
		if (device === undefined) {
			device = self.DEVICE
		}

		if (!device || !self.isConnectionCurrent(generation, device) || self.SYSTEM_INFO_CHECK_IN_FLIGHT) {
			return
		}

		self.SYSTEM_INFO_CHECK_IN_FLIGHT = true

		try {
			try {
				const info = await device.getSystemInfo()
				if (!self.isConnectionCurrent(generation, device)) {
					return
				}

				self.STATE.system_info = info?.msg || null
			} catch (error) {
				if (error.unreachable === true || error.authFailure === true) {
					await self.handleRequestError(error, 'Error getting system info')
					return
				}

				self.log('error', 'Error getting system info: ' + error.message)
			}

			try {
				const version = await device.getVersion()
				if (!self.isConnectionCurrent(generation, device)) {
					return
				}

				self.STATE.sn = version?.msg?.sn || ''
				self.STATE.version = version?.msg?.version || ''
			} catch (error) {
				if (error.unreachable === true || error.authFailure === true) {
					await self.handleRequestError(error, 'Error getting version')
					return
				}

				self.log('error', 'Error getting version: ' + error.message)
			}
		} finally {
			self.SYSTEM_INFO_CHECK_IN_FLIGHT = false
		}

		if (!self.isConnectionCurrent(generation, device)) {
			return
		}

		self.checkVariables()
	},

	rebuildChoices: function () {
		let self = this

		let inputChoices = self.STATE.inputs.map((input) => ({
			id: input.id,
			label: input.alias || input.name || `Input ${input.id}`,
		}))
		if (inputChoices.length === 0) {
			inputChoices = [{ ...constants.PLACEHOLDER_INPUT }]
		}

		let outputChoices = self.STATE.outputs.map((output) => ({
			id: output.id,
			label: output.alias || output.name || `Output ${output.id}`,
		}))
		if (outputChoices.length === 0) {
			outputChoices = [{ ...constants.PLACEHOLDER_OUTPUT }]
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
