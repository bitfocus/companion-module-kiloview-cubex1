// Kiloview CUBE X1
const { InstanceBase, InstanceStatus } = require('@companion-module/base')
const upgrades = require('./upgrades')

const KiloviewCubeX1 = require('./cubex1')
const config = require('./config')

const actions = require('./actions')
const feedbacks = require('./feedbacks')
const variables = require('./variables')
const presets = require('./presets')

const api = require('./api')

const constants = require('./constants')

class KiloviewX1Instance extends InstanceBase {
	constructor(internal) {
		super(internal)

		Object.assign(this, {
			...config,
			...actions,
			...feedbacks,
			...variables,
			...presets,
			...api,
		})

		this.POLLINGRATE = constants.POLLINGRATE
		this.POLLINGRATE_MAX = constants.POLLINGRATE_MAX
		this.POLLINGRATE_RESOURCES = constants.POLLINGRATE_RESOURCES
		this.POLLINGRATE_RESOURCES_MAX = constants.POLLINGRATE_RESOURCES_MAX
		this.RECONNECT_TIME = constants.RECONNECT_TIME
		this.TOKEN_REFRESH_TIME = constants.TOKEN_REFRESH_TIME
		this.REQUEST_TIMEOUT_DEFAULT = constants.REQUEST_TIMEOUT_DEFAULT
		this.REQUEST_BODY_MAX_BYTES = constants.REQUEST_BODY_MAX_BYTES
		this.POLL_ERROR_WARNING_THRESHOLD = constants.POLL_ERROR_WARNING_THRESHOLD
		this.CHOICES_LOCK_MODE = constants.CHOICES_LOCK_MODE
		this.CHOICES_COLLECT_MODE = constants.CHOICES_COLLECT_MODE

		this.initInstanceState()
	}

	initInstanceState() {
		const choices = constants.createDefaultChoiceSets()

		this.STATE = constants.createDefaultState()
		this.CHOICES_INPUTS = choices.CHOICES_INPUTS
		this.CHOICES_OUTPUTS = choices.CHOICES_OUTPUTS
		this.CHOICES_ROTATION_LISTS = choices.CHOICES_ROTATION_LISTS
		this.CHOICES_TEMPLATES = choices.CHOICES_TEMPLATES

		this.DEVICE = undefined
		this.secrets = {}
		this.INTERVAL = null
		this.INTERVAL_RESOURCES = null
		this.RECONNECT_INTERVAL = null
		this.TOKEN_INTERVAL = null
		this.STATE_CHECK_IN_FLIGHT = false
		this.SYSTEM_INFO_CHECK_IN_FLIGHT = false
		this.TOKEN_REFRESH_IN_FLIGHT = false
		this.CONNECTION_GENERATION = 0
		this.INIT_CONNECTION_PROMISE = null
		this.POLL_ERROR_COUNT = 0
		this._destroyed = false
	}

	getPassword() {
		return this.secrets?.password || ''
	}

	normalizeHost(host) {
		return KiloviewCubeX1.formatHostForUrl(host)
	}

	isValidHost(host) {
		return KiloviewCubeX1.isValidHost(host)
	}

	normalizeConfig(config) {
		const normalized = { ...config }

		if (normalized.host !== undefined && normalized.host !== null) {
			normalized.host = this.normalizeHost(String(normalized.host))
		}

		if (normalized.port !== undefined && normalized.port !== null && normalized.port !== '') {
			normalized.port = parseInt(normalized.port, 10)
			if (!Number.isFinite(normalized.port)) {
				normalized.port = normalized.protocol === 'https' ? 443 : 80
			}
		} else {
			normalized.port = normalized.protocol === 'https' ? 443 : 80
		}

		if (normalized.request_timeout !== undefined && normalized.request_timeout !== null) {
			const timeout = parseInt(normalized.request_timeout, 10)
			normalized.request_timeout = Number.isFinite(timeout) ? timeout : this.REQUEST_TIMEOUT_DEFAULT
		} else {
			normalized.request_timeout = this.REQUEST_TIMEOUT_DEFAULT
		}

		return normalized
	}

	async init(config, isFirstInit, secrets) {
		await this.configUpdated(config, secrets)
	}

	async destroy() {
		try {
			this._destroyed = true
			this.CONNECTION_GENERATION++
			this.stopIntervals()
			await this.INIT_CONNECTION_PROMISE
			await this.disposeDevice(this.DEVICE)
			this.DEVICE = null
			this.updateStatus(InstanceStatus.Disconnected)
		} catch (error) {
			this.log('error', 'destroy error: ' + error)
		}
	}

	async configUpdated(config, secrets) {
		this.config = this.normalizeConfig(config)
		if (secrets !== undefined) {
			this.secrets = secrets || {}
		}

		if (this.config.host && !this.isValidHost(this.config.host)) {
			this.log('error', `Invalid host "${this.config.host}". Use a valid IPv4/IPv6 address or hostname.`)
			this.updateStatus(InstanceStatus.ConnectionFailure, 'Invalid host configured')
			return
		}

		if (
			this.config.protocol === 'https' &&
			this.config.port === 80 &&
			config.port !== undefined &&
			parseInt(config.port, 10) === 80
		) {
			this.log('warn', 'HTTPS is selected but port 80 is configured. Consider using port 443 for HTTPS connections.')
		}

		this.initActions()
		this.initFeedbacks()
		this.initVariables()
		this.initPresets()

		await this.initConnection()
	}
}

module.exports = KiloviewX1Instance
module.exports.UpgradeScripts = upgrades
